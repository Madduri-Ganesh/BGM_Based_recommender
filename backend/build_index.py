import os.path
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import faiss
import numpy as np
import os
import librosa
from music2latent import EncoderDecoder
import tempfile
import json
import torch

BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent
# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def main():
  """Shows basic usage of the Drive v3 API.
  Prints the names and ids of the first 10 files the user has access to.
  """
  creds = None
  token_path = BASE_DIR / "token.json"
  creds_path = BASE_DIR / "credentials.json"
  
  # The file token.json stores the user's access and refresh tokens, and is
  # created automatically when the authorization flow completes for the first
  # time.
  if os.path.exists(token_path):
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)
  # If there are no (valid) credentials available, let the user log in.
  if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
      try:
        creds.refresh(Request())
      except Exception:
        # If refreshing fails (e.g. token revoked), fall back to re-auth
        flow = InstalledAppFlow.from_client_secrets_file(
            creds_path, SCOPES
        )
        creds = flow.run_local_server(port=0)
    else:
      flow = InstalledAppFlow.from_client_secrets_file(
          creds_path, SCOPES
      )
      creds = flow.run_local_server(port=0)
    # Save the credentials for the next run
    with open(token_path, "w") as token:
      token.write(creds.to_json())

  try:
    service = build("drive", "v3", credentials=creds)

    folder_id = os.environ.get("BGM_DRIVE_FOLDER_ID", "")
    if not folder_id:
        print("ERROR: DRIVE_FOLDER_ID environment variable is not set.")
        return

    # Define the query to find files whose parent is the specific folder ID
    query = f"'{folder_id}' in parents and trashed = false"

    page_token = None

    d = 192 # 64 dims * 3 thirds
    # Switch to Inner Product for Cosine Similarity (requires normalized vectors)
    index = faiss.IndexFlatIP(d)     
    print(f"Is index trained? {index.is_trained}")
    song_id = []
    encdec = EncoderDecoder() 
       
    # Helper to structurally chunk, encode, and pool audio
    def process_and_pool_audio(waveform, sr, micro_chunk_duration_sec=10):
        total_length = len(waveform)
        if total_length == 0:
            return None
            
        # 1. Split into Thirds
        third_length = total_length // 3
        thirds = [
            waveform[0:third_length],
            waveform[third_length:2*third_length],
            waveform[2*third_length:]
        ]
        
        micro_chunk_length = micro_chunk_duration_sec * sr
        third_vectors = []
        
        # 2. Process each Third
        for third_idx, third_wv in enumerate(thirds):
            if len(third_wv) == 0:
                # Fallback for extremely short audio where third is empty
                third_vectors.append(torch.zeros(64))
                continue
                
            chunk_latents = []
            third_total_len = len(third_wv)
            
            # Micro-chunk the Third to save memory
            for i in range(0, third_total_len, micro_chunk_length):
                chunk = third_wv[i:min(i + micro_chunk_length, third_total_len)]
                
                # music2latent's convolutions will crash if the audio tensor is too small.
                # If a remainder chunk is less than 1 second (sr), skip it,
                # unless it's the ONLY chunk (in which case we pad it).
                if len(chunk) < sr:
                    if len(chunk_latents) > 0:
                        continue
                    else:
                        pad_len = sr - len(chunk)
                        chunk = np.pad(chunk, (0, pad_len))
                
                if not isinstance(chunk, torch.Tensor):
                    chunk = torch.tensor(chunk)
                
                with torch.no_grad():
                    latent = encdec.encode(chunk)
                chunk_latents.append(latent)
            
            # Pool the micro-chunks for this Third
            if chunk_latents:
                pooled_chunks = []
                for latent in chunk_latents:
                    pooled = latent.mean(dim=2) # (1, 64)
                    pooled_chunks.append(pooled)
                    
                # Average all micro-chunks together for this Third
                third_vector = torch.stack(pooled_chunks).mean(dim=0).squeeze() # (64,)
            else:
                third_vector = torch.zeros(64)
                
            third_vectors.append(third_vector)
            
        # 3. Concatenate the Three Thirds
        # Results in a (192,) shape vector
        final_structural_vector = torch.cat(third_vectors) 
        
        # Format for FAISS: (1, 192)
        return final_structural_vector.unsqueeze(0)
        
    while True:
        results = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name)",
            pageSize=100,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            pageToken=page_token
        ).execute()

        items = results.get('files', [])

        for item in items:
            file_id = item['id']
            file_name = item['name']
            print(f"Downloading {file_name}...")

            # --- DOWNLOAD AND PROCESS EACH FILE ---
            request = service.files().get_media(fileId=file_id)
            
            # Create a temporary file to hold the MP3 data securely
            # The file is created and cleaned up by Python
            fd, temp_file_path = tempfile.mkstemp(suffix='.mp3')
            try:
                with os.fdopen(fd, 'wb') as temp_file:
                    downloader = MediaIoBaseDownload(temp_file, request)
                    done = False
                    while done is False:
                        status, done = downloader.next_chunk()

                # Load audio from the temporary file
                wv, sr = librosa.load(temp_file_path, sr=16000)  
                print(f"Loaded {file_name} with shape {wv.shape}")
                
                # Extract structural embeddings via "Plan B"
                latent = process_and_pool_audio(wv, sr, micro_chunk_duration_sec=10)
                if latent is None:
                    continue
                    
                latent_2d = latent.numpy().astype('float32') # (1, 192)
                
                if latent_2d.shape[1] != d:
                    print(f"Warning: Unexpected dimension mismatch for {file_name}. Expected {d}, got {latent_2d.shape[1]}")
                    continue
                    
                # Normalize vector for Cosine Similarity
                faiss.normalize_L2(latent_2d)
                    
                # ADD TO FAISS
                index.add(latent_2d)
                song_id.append(file_name)
                print(f"Added latent vector for {file_name} to the index.")

            except librosa.util.exceptions.ParameterError as e:
                print(f"Error loading audio for {file_name}: {e}")
            except Exception as e:
                # Re-raise KeyboardInterrupt so the user can easily stop the script
                if isinstance(e, KeyboardInterrupt):
                    raise
                print(f"Error processing {file_name}: {e}")
            finally:
                # Always clean up the temporary file
                if os.path.exists(temp_file_path):
                    try:
                        os.remove(temp_file_path)
                    except OSError:
                        pass

        page_token = results.get('nextPageToken', None)
        if page_token is None:
            break

        # Save the index AFTER processing everything
    faiss.write_index(index, str(BACKEND_DIR / "Music_data_bgm_index.faiss"))
    print(f"Successfully saved FAISS index with {index.ntotal} vectors.")

    with open(str(BACKEND_DIR / "Music_data_song_ids.json"), "w") as f:
        json.dump(song_id, f)
    print("Saved song IDs to Music_data_song_ids.json")

  except HttpError as error:
    print(f"An API error occurred: {error}")

if __name__ == "__main__":
    main()