const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.flac'];
const AUDIO_MIME_TYPES = [
    'audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/flac', 'audio/x-flac',
];

/**
 * Validate a dropped/selected file.
 * Returns { valid: boolean, error: string|null }
 */
export function validateAudioFile(file) {
    if (!file) {
        return { valid: false, error: 'No file selected.' };
    }

    // Check if it's an audio file at all
    const isAudio = file.type.startsWith('audio/') || AUDIO_MIME_TYPES.includes(file.type);
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);

    if (!isAudio && !isAllowedExt) {
        return { valid: false, error: 'Please upload a valid audio file.' };
    }

    if (isAudio && !isAllowedExt) {
        return { valid: false, error: 'Only .mp3, .wav, and .flac files are supported.' };
    }

    return { valid: true, error: null };
}

/**
 * Get audio duration from a File object via Web Audio API.
 * Returns a Promise<number> (seconds).
 */
export function getAudioDuration(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.addEventListener('loadedmetadata', () => {
            resolve(audio.duration);
            URL.revokeObjectURL(url);
        });
        audio.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read audio duration'));
        });
        audio.src = url;
    });
}

/**
 * Format file size in human-readable form.
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
