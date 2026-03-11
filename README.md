---
title: BGM Music Recommender
emoji: 🎵
colorFrom: blue
colorTo: purple
sdk: docker
app_file: app.py
pinned: false
---

# 🎵 BGM-Based Music Recommender

A music recommendation system that finds similar songs based on **background music (BGM)** analysis. Upload any audio file, and the system encodes it into a latent vector using [music2latent](https://github.com/SonyCSLParis/music2latent), then searches a FAISS similarity index built from the [FMA dataset](https://github.com/mdeff/fma) to return the most similar tracks — complete with in-browser playback.

---

## ✨ Features

- **Audio upload & encoding** — accepts `.mp3`, `.wav`, and `.flac` files
- **Latent-space similarity search** — powered by [music2latent](https://github.com/SonyCSLParis/music2latent) + [FAISS](https://github.com/facebookresearch/faiss)
- **Real-time progress tracking** — background processing with live status updates
- **In-browser audio playback** — stream recommended tracks via [WaveSurfer.js](https://wavesurfer.xyz/)
- **Google Drive integration** — song library stored and streamed from Google Drive

---

## 🏗️ Architecture

```
┌──────────────┐    upload     ┌──────────────────┐    FAISS     ┌─────────────┐
│   Frontend   │ ────────────► │  FastAPI Backend  │ ──────────► │  FMA Index  │
│  (Vite + JS) │ ◄──────────── │    (app.py)       │             │  (.faiss)   │
└──────────────┘   results     └────────┬─────────┘             └─────────────┘
                                        │
                                        │ stream
                                        ▼
                                ┌──────────────┐
                                │ Google Drive  │
                                │  (FMA songs)  │
                                └──────────────┘
```

**Pipeline overview:**

1. User uploads an audio file via the web UI
2. Backend loads audio at 16 kHz with `librosa`
3. `music2latent` encodes the waveform into a latent vector
4. FAISS searches the pre-built index for the nearest neighbors
5. Matched song metadata is returned; audio is streamed from Google Drive

---

## 📁 Project Structure

```
BGM_Based_recommender/
├── backend/
│   ├── app.py                  # FastAPI backend (upload, progress, streaming)
│   ├── build_index.py          # Script to download FMA data and build the FAISS index
│   ├── FMA_bgm_index.faiss     # FAISS index (generated — see setup)
│   └── FMA_song_ids.json       # Song ID mapping (generated — see setup)
├── frontend/                   # Vite + vanilla JS frontend
│   ├── src/                    # Source files (components, styles, utils)
│   └── dist/                   # Production build (served by FastAPI)
├── .env.example                # Template for required environment variables
├── credentials.json            # Google API OAuth credentials (gitignored)
├── token.json                  # Google OAuth token — auto-generated (gitignored)
└── requirements.txt            # Python dependencies
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** (for the frontend)
- **ffmpeg** (required by `librosa` / `pydub`)
- A **Google Cloud** project with the Drive API enabled and OAuth credentials (`credentials.json`)

### 1. Clone & set up the Python environment

```bash
git clone <repo-url>
cd BGM_Based_recommender

python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Create a `.env` file in the project root (already gitignored):

```env
DRIVE_FOLDER_ID=your_google_drive_folder_id_here
```

### 3. Set up Google Drive credentials

1. Place your `credentials.json` (OAuth client secret) in the project root.
2. On first run the app will open a browser window for Google sign-in and save `token.json` automatically.

### 4. Build the FAISS index

You need to download the FMA songs from Google Drive, encode them with `music2latent`, and build a FAISS similarity index.

To set up Google Drive API access, follow the official guide:
👉 [Google Drive API Python Quickstart](https://developers.google.com/workspace/drive/api/quickstart/python)

Once configured, you can use the provided script to generate the required files:

```bash
python backend/build_index.py
```

This script will:
1. Download audio files from the Google Drive folder specified by `DRIVE_FOLDER_ID`
2. Encode each file into a latent vector using `music2latent`
3. Build a FAISS `IndexFlatL2` and save it as `backend/FMA_bgm_index.faiss`
4. Save the ordered song IDs as `backend/FMA_song_ids.json`

### 5. Install & build the frontend

```bash
cd frontend
npm install
npm run build       # produces dist/ for production
cd ..
```

### 6. Run the application

```bash
python backend/app.py
# or
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000** in your browser.

---

## 🔧 Usage

1. Open the app in your browser
2. Upload an audio file (`.mp3`, `.wav`, or `.flac`)
3. Watch real-time progress as the file is processed
4. Browse and play the recommended tracks directly in the browser

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload an audio file; returns a `job_id` |
| `GET`  | `/api/status/{job_id}` | Poll processing progress & results |
| `GET`  | `/api/uploaded/{filename}` | Serve a previously uploaded file |
| `GET`  | `/api/audio/{song_id}` | Stream a recommended song from Google Drive |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **ML Encoding** | [music2latent](https://github.com/SonyCSLParis/music2latent) |
| **Similarity Search** | [FAISS](https://github.com/facebookresearch/faiss) (L2 index) |
| **Audio Processing** | [librosa](https://librosa.org/) |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn |
| **Frontend** | Vanilla JS + [Vite](https://vitejs.dev/) + [WaveSurfer.js](https://wavesurfer.xyz/) |
| **Storage** | Google Drive API v3 |
| **Environment** | [python-dotenv](https://github.com/theskumar/python-dotenv) |

---

## 🎶 FMA Dataset

This project uses the [Free Music Archive (FMA)](https://github.com/mdeff/fma) — an open and easily accessible dataset of music for research purposes.

### How It's Used

- **100 instrumental tracks** from the FMA dataset are stored on Google Drive
- Each track was processed through a vocal separation model (`bs_roformer`) to isolate the instrumental/BGM layer
- The instrumentals are then encoded into latent vectors using `music2latent` and indexed with FAISS for similarity search

### Local Data

The `FMA Data/` directory contains a local copy of the dataset metadata in [HuggingFace Arrow format](https://huggingface.co/docs/datasets):

| File | Description |
|------|-------------|
| `data-00000-of-00001.arrow` | Audio data and metadata (~115 MB) |
| `dataset_info.json` | Schema definition (fields: `title`, `bgm_path`) |
| `state.json` | Dataset split information |

Audio is stored at **44,100 Hz** sample rate. During encoding, audio is resampled to **16,000 Hz** for `music2latent`.

### Index Stats

| Metric | Value |
|--------|-------|
| Indexed songs | 100 |
| FAISS index type | `IndexFlatL2` (exact L2 search) |
| Index file size | ~2.8 MB |

---

## 📄 License

This project is for educational and personal use.
