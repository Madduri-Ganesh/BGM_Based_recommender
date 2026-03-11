/**
 * Upload Screen — drag-and-drop + file preview before submission.
 */
import { navigate } from '../router.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { validateAudioFile, getAudioDuration, formatFileSize } from '../utils/file-validation.js';
import { formatTime } from '../utils/format-time.js';
import { uploadAudio } from '../api.js';
import '../styles/upload.css';

// Shared state for the selected file
let selectedFile = null;

export function renderUpload() {
    selectedFile = null;

    const screen = document.createElement('div');
    screen.className = 'upload-screen';

    // Breadcrumb
    screen.appendChild(createBreadcrumb('upload'));

    // Header with back button
    const header = document.createElement('div');
    header.className = 'upload-header';
    header.innerHTML = `
    <button class="btn btn-ghost" id="btn-back" aria-label="Back to welcome screen">← Back to Welcome</button>
  `;
    screen.appendChild(header);

    // Container
    const container = document.createElement('div');
    container.className = 'upload-container';
    container.innerHTML = `
    <h1 class="upload-title">Upload Your Track</h1>
    <p class="upload-hint">Drop an audio file to find similar music</p>
    <div id="dropzone-area"></div>
    <div id="upload-error" class="upload-error"></div>
    <div id="file-preview-area"></div>
  `;
    screen.appendChild(container);

    // Build dropzone
    const dropzoneArea = container.querySelector('#dropzone-area');
    const errorArea = container.querySelector('#upload-error');
    const previewArea = container.querySelector('#file-preview-area');

    renderDropzone(dropzoneArea, errorArea, previewArea);

    // Back button
    screen.querySelector('#btn-back').addEventListener('click', () => navigate('/'));

    return screen;
}

function renderDropzone(dropzoneArea, errorArea, previewArea) {
    const dz = document.createElement('div');
    dz.className = 'dropzone';
    dz.setAttribute('tabindex', '0');
    dz.setAttribute('role', 'button');
    dz.setAttribute('aria-label', 'Drop an audio file here or click to browse');
    dz.id = 'dropzone';

    dz.innerHTML = `
    <div class="dropzone-icon">🎵</div>
    <p class="dropzone-text">
      Drag & drop your audio file here<br/>
      or <strong>click to browse</strong>
    </p>
    <p class="dropzone-formats">Supports .mp3, .wav, .flac</p>
    <input type="file" id="file-input" accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac" />
  `;

    const fileInput = dz.querySelector('#file-input');

    // Click to browse
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    // Drag events
    dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('drag-over');
    });

    dz.addEventListener('dragleave', () => {
        dz.classList.remove('drag-over');
    });

    dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        handleFileSelect(file, dropzoneArea, errorArea, previewArea);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        handleFileSelect(file, dropzoneArea, errorArea, previewArea);
    });

    dropzoneArea.innerHTML = '';
    dropzoneArea.appendChild(dz);
}

async function handleFileSelect(file, dropzoneArea, errorArea, previewArea) {
    errorArea.innerHTML = '';

    const result = validateAudioFile(file);
    if (!result.valid) {
        errorArea.innerHTML = `<div class="error-message">${result.error}</div>`;
        return;
    }

    selectedFile = file;

    // Get duration
    let durationStr = '--:--';
    try {
        const dur = await getAudioDuration(file);
        durationStr = formatTime(dur);
    } catch {
        // Duration unavailable
    }

    // Hide dropzone, show preview
    dropzoneArea.style.display = 'none';

    previewArea.innerHTML = '';
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    preview.innerHTML = `
    <div class="file-preview-header">
      <div class="file-icon">🎵</div>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-meta">
          <span>${formatFileSize(file.size)}</span>
          <span>Duration: ${durationStr}</span>
        </div>
      </div>
    </div>
    <div class="file-preview-actions">
      <button class="btn btn-primary" id="btn-confirm" aria-label="Confirm and process this audio file">
        Confirm & Process
      </button>
      <button class="link" id="btn-change" aria-label="Choose a different file">
        Choose a Different File
      </button>
    </div>
  `;

    previewArea.appendChild(preview);

    // Confirm => upload and navigate to processing
    preview.querySelector('#btn-confirm').addEventListener('click', async () => {
        const confirmBtn = preview.querySelector('#btn-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Uploading…';

        try {
            const response = await uploadAudio(selectedFile);
            // Store job info for processing screen
            sessionStorage.setItem('jobId', response.job_id);
            sessionStorage.setItem('uploadedFile', response.uploaded_file);
            sessionStorage.setItem('originalFilename', selectedFile.name);
            navigate('/processing');
        } catch (err) {
            const errorArea2 = previewArea.closest('.upload-container').querySelector('#upload-error');
            errorArea2.innerHTML = `<div class="error-message">Upload failed: ${err.message}</div>`;
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Process';
        }
    });

    // Change file => reset
    preview.querySelector('#btn-change').addEventListener('click', () => {
        selectedFile = null;
        previewArea.innerHTML = '';
        dropzoneArea.style.display = '';
        renderDropzone(dropzoneArea, errorArea.closest('.upload-container').querySelector('#upload-error'), previewArea);
    });
}
