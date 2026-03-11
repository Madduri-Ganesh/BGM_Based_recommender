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

    folder_id = os.environ.get("DRIVE_FOLDER_ID", "")
    if not folder_id:
        print("ERROR: DRIVE_FOLDER_ID environment variable is not set.")
        return

    # Define the query to find files whose parent is the specific folder ID
    query = f"'{folder_id}' in parents and trashed = false"

    page_token = None

    d = 7424                           
    k = 3                            
    index = faiss.IndexFlatL2(d)     
    print(f"Is index trained? {index.is_trained}")
    song_id = []
    encdec = EncoderDecoder()    
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
                
                latent = encdec.encode(wv)
                latent_2d = latent.reshape(latent.shape[0], -1).numpy().astype('float32')
                
                if latent_2d.shape[1] != d:
                    print(f"Warning: Dimension mismatch for {file_name}. Expected {d}, got {latent_2d.shape[1]}")
                    continue 
                    
                # ADD TO FAISS: Note that python FAISS add() only takes the array
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
    faiss.write_index(index, str(BACKEND_DIR / "FMA_bgm_index.faiss"))
    print(f"Successfully saved FAISS index with {index.ntotal} vectors.")

    with open(str(BACKEND_DIR / "FMA_song_ids.json"), "w") as f:
        json.dump(song_id, f)
    print("Saved song IDs to FMA_song_ids.json")

  except HttpError as error:
    print(f"An API error occurred: {error}")

if __name__ == "__main__":
    main()