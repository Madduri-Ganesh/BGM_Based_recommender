/**
 * API client for communicating with the FastAPI backend.
 */

const BASE = '';  // Proxied via Vite dev server

/**
 * Upload an audio file. Returns { job_id, uploaded_file }.
 */
export async function uploadAudio(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BASE}/api/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload failed');
    }

    return res.json();
}

/**
 * Poll job status. Returns { status, stage, progress, results, error }.
 */
export async function getJobStatus(jobId) {
    const res = await fetch(`${BASE}/api/status/${jobId}`);
    if (!res.ok) throw new Error('Failed to fetch job status');
    return res.json();
}

/**
 * Get URL for an uploaded file (user's track).
 */
export function getUploadedFileUrl(filename) {
    return `${BASE}/api/uploaded/${encodeURIComponent(filename)}`;
}

/**
 * Get URL for a recommended song (streamed from Google Drive).
 */
export function getSongStreamUrl(songId) {
    return `${BASE}/api/audio/${encodeURIComponent(songId)}`;
}
