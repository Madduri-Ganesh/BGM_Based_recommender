"""
FastAPI backend for the BGM Music Recommender.

Exposes endpoints for audio upload, processing with real-time progress,
and streaming recommended songs from Google Drive.
"""

import os
import uuid
import json
import logging
import tempfile
import threading
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import faiss
import librosa
import numpy as np
import torch
from music2latent import EncoderDecoder

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent
INDEX_PATH = BACKEND_DIR / "FMA_bgm_index.faiss"
SONG_IDS_PATH = BACKEND_DIR / "FMA_song_ids.json"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "")

SAMPLE_RATE = 16000
TOP_K = 5

# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------
_faiss_index: Optional[faiss.Index] = None
_song_ids: Optional[list] = None
_encoder: Optional[EncoderDecoder] = None
_drive_service = None


def get_faiss_index():
    global _faiss_index
    if _faiss_index is None:
        _faiss_index = faiss.read_index(str(INDEX_PATH))
        logger.info("Loaded FAISS index with %d vectors.", _faiss_index.ntotal)
    return _faiss_index


def get_song_ids():
    global _song_ids
    if _song_ids is None:
        with open(SONG_IDS_PATH, "r") as f:
            _song_ids = json.load(f)
        logger.info("Loaded %d song IDs.", len(_song_ids))
    return _song_ids


def get_encoder():
    global _encoder
    if _encoder is None:
        _encoder = EncoderDecoder()
        logger.info("Initialized music2latent encoder.")
    return _encoder


def get_drive_service():
    global _drive_service
    if _drive_service is not None:
        return _drive_service

    creds = None
    token_path = BASE_DIR / "token.json"
    creds_path = BASE_DIR / "credentials.json"

    if "GOOGLE_TOKEN_JSON" in os.environ:
        try:
            token_data = json.loads(os.environ["GOOGLE_TOKEN_JSON"])
            creds = Credentials.from_authorized_user_info(token_data, GOOGLE_SCOPES)
            logger.info("Loaded Google credentials from GOOGLE_TOKEN_JSON environment variable.")
        except Exception as e:
            logger.error("Failed to parse GOOGLE_TOKEN_JSON: %s", e)
    elif token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), GOOGLE_SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), GOOGLE_SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Only try to save the file locally if running on a local machine (not HF Space)
        if "GOOGLE_TOKEN_JSON" not in os.environ:
            try:
                with open(token_path, "w") as token:
                    token.write(creds.to_json())
            except Exception as e:
                logger.warning("Could not save token.json: %s", e)

    _drive_service = build("drive", "v3", credentials=creds)
    return _drive_service


def extract_title(song_id: str) -> str:
    """Extract a human-readable title from song filename."""
    # Remove the model suffix like _(Instrumental)_model_bs_roformer_ep_317_sdr_12.mp3
    name = song_id
    idx = name.find("_(Instrumental)")
    if idx != -1:
        name = name[:idx]
    else:
        name = name.rsplit(".", 1)[0]  # remove extension
    # Replace underscores with spaces
    name = name.replace("_", " ")
    return name.strip()


# ---------------------------------------------------------------------------
# Job tracking for real progress
# ---------------------------------------------------------------------------
jobs: dict = {}


def process_upload_job(job_id: str, file_path: str):
    """Run the full pipeline in a background thread, updating job status."""
    try:
        # Stage 1: Loading audio
        jobs[job_id]["stage"] = "Loading audio..."
        jobs[job_id]["progress"] = 10
        logger.info("Job %s: Loading audio from %s", job_id, file_path)

        waveform, _ = librosa.load(file_path, sr=SAMPLE_RATE)
        jobs[job_id]["progress"] = 25

        # Stage 2: Extracting features
        jobs[job_id]["stage"] = "Extracting features..."
        jobs[job_id]["progress"] = 30
        logger.info("Job %s: Encoding audio", job_id)

        encoder = get_encoder()
        latent = encoder.encode(waveform)  # (1, 64, time)

        # Flatten to match how quickstart.py built the FAISS index
        feature_vector = (
            latent.reshape(latent.shape[0], -1)
            .detach()
            .numpy()
            .astype("float32")
        )
        jobs[job_id]["progress"] = 60

        # Stage 3: Finding matches
        jobs[job_id]["stage"] = "Finding matches..."
        jobs[job_id]["progress"] = 70
        logger.info("Job %s: Querying FAISS index", job_id)

        index = get_faiss_index()
        song_ids = get_song_ids()

        # Pad or truncate to match FAISS index dimension
        index_dim = index.d
        vec_dim = feature_vector.shape[1]
        if vec_dim != index_dim:
            logger.warning("Dimension mismatch: vector=%d, index=%d. Adjusting.", vec_dim, index_dim)
            if vec_dim < index_dim:
                feature_vector = np.pad(feature_vector, ((0, 0), (0, index_dim - vec_dim)))
            else:
                feature_vector = feature_vector[:, :index_dim]

        distances, indices = index.search(feature_vector, TOP_K)

        results = []
        for rank, faiss_id in enumerate(indices[0], start=1):
            if faiss_id == -1:
                continue
            sid = song_ids[faiss_id]
            dist = float(distances[0][rank - 1])
            results.append({
                "rank": rank,
                "song_id": sid,
                "title": extract_title(sid),
                "distance": dist,
            })

        jobs[job_id]["progress"] = 100
        jobs[job_id]["stage"] = "Done"
        jobs[job_id]["status"] = "done"
        jobs[job_id]["results"] = results
        logger.info("Job %s: Complete with %d results", job_id, len(results))

    except Exception as e:
        import traceback
        logger.error("Job %s failed: %s\n%s", job_id, e, traceback.format_exc())
        jobs[job_id]["status"] = "error"
        jobs[job_id]["stage"] = "Error"
        jobs[job_id]["error"] = str(e) or "An unknown error occurred during processing"

    finally:
        # Schedule delayed cleanup — keep file for 30 min so the mini-player can access it
        def delayed_cleanup():
            import time
            time.sleep(1800)  # 30 minutes
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info("Job %s: Cleaned up uploaded file %s (delayed)", job_id, file_path)
            except OSError:
                pass

        cleanup_thread = threading.Thread(target=delayed_cleanup, daemon=True)
        cleanup_thread.start()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="BGM Music Recommender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    """Accept an audio file upload, start background processing, return job ID."""
    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in {".mp3", ".wav", ".flac"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Only .mp3, .wav, and .flac are supported.",
        )

    # Save uploaded file
    job_id = str(uuid.uuid4())
    safe_filename = f"{job_id}{ext}"
    saved_path = UPLOAD_DIR / safe_filename

    with open(saved_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "status": "processing",
        "stage": "Preparing...",
        "progress": 0,
        "results": None,
        "error": None,
        "original_filename": file.filename,
        "saved_filename": safe_filename,
    }

    # Start background processing
    thread = threading.Thread(
        target=process_upload_job,
        args=(job_id, str(saved_path)),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "uploaded_file": safe_filename}


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """Poll the current processing status of a job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return {
        "status": job["status"],
        "stage": job["stage"],
        "progress": job["progress"],
        "results": job["results"],
        "error": job["error"],
        "original_filename": job.get("original_filename"),
        "saved_filename": job.get("saved_filename"),
    }


@app.get("/api/uploaded/{filename}")
async def serve_uploaded_file(filename: str):
    """Serve a previously uploaded audio file."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), media_type="audio/mpeg")


@app.get("/api/audio/{song_id:path}")
async def stream_song(song_id: str):
    """Stream a recommended song from Google Drive."""
    try:
        service = get_drive_service()

        # Convert cleaned song ID back to the original filename on Drive
        drive_filename = song_id.replace(".mp3", "_(Instrumental)_model_bs_roformer_ep_317_sdr_12.mp3")

        # Search for the file by name in the drive folder
        query = f"name='{drive_filename}' and '{DRIVE_FOLDER_ID}' in parents and trashed=false"
        result = service.files().list(
            q=query,
            fields="files(id, name, mimeType)",
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
        ).execute()

        files = result.get("files", [])
        if not files:
            raise HTTPException(status_code=404, detail=f"Song not found: {song_id}")

        file_id = files[0]["id"]

        # Download to a temp file and stream it
        request = service.files().get_media(fileId=file_id)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        downloader = MediaIoBaseDownload(tmp, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        tmp.close()

        def file_iterator():
            try:
                with open(tmp.name, "rb") as f:
                    while chunk := f.read(8192):
                        yield chunk
            finally:
                os.unlink(tmp.name)

        return StreamingResponse(
            file_iterator(),
            media_type="audio/mpeg",
            headers={"Accept-Ranges": "bytes"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to stream song %s: %s", song_id, e)
        raise HTTPException(status_code=500, detail="Failed to stream song")


@app.get("/")
async def root():
    """Simple health check endpoint for Hugging Face Spaces."""
    return {"message": "BGM Recommender API is running!", "status": "ok"}

# ---------------------------------------------------------------------------
# Serve frontend (production)
# ---------------------------------------------------------------------------
frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
