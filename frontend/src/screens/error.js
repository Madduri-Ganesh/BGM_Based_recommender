/**
 * Error Screen — shown when processing fails.
 */
import { navigate } from '../router.js';
import '../styles/results.css';

export function renderError() {
    const errorMsg = sessionStorage.getItem('processingError') || 'Something went wrong while processing your file.';
    const jobId = sessionStorage.getItem('jobId');

    const screen = document.createElement('div');
    screen.className = 'processing-screen'; // reuse flex layout
    screen.innerHTML = `
    <div class="error-screen-body">
      <div class="error-icon">⚠</div>
      <h1 class="error-heading">Something Went Wrong</h1>
      <p class="error-detail">${escapeHtml(errorMsg)}</p>
      <div class="error-actions">
        <button class="btn btn-error" id="btn-retry" aria-label="Try again with the same file">Try Again</button>
        <button class="btn btn-error-outline" id="btn-different" aria-label="Upload a different file">Upload a Different File</button>
      </div>
    </div>
  `;

    screen.querySelector('#btn-retry').addEventListener('click', () => {
        // Re-navigate to processing to re-submit
        // (The file is already on the server, so we'd need to re-upload)
        // For simplicity, go back to upload
        sessionStorage.removeItem('processingError');
        navigate('/upload');
    });

    screen.querySelector('#btn-different').addEventListener('click', () => {
        sessionStorage.clear();
        navigate('/upload');
    });

    return screen;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
