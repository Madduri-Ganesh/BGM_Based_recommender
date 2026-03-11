/**
 * Audio Player Component — WaveSurfer.js integration with full controls.
 */
import WaveSurfer from 'wavesurfer.js';
import { formatTime } from '../utils/format-time.js';
import { announce } from '../router.js';
import '../styles/player.css';

/**
 * Create an audio player with waveform visualization.
 *
 * @param {Object} options
 * @param {string} options.src - Audio source URL
 * @param {string} options.label - Label for accessibility (e.g., track name)
 * @param {boolean} [options.compact] - If true, use a smaller waveform height
 * @returns {{ element: HTMLElement, wavesurfer: WaveSurfer, destroy: Function }}
 */
export function createAudioPlayer({ src, label, compact = false }) {
    const container = document.createElement('div');
    container.className = 'audio-player';

    // Loading state
    const loading = document.createElement('div');
    loading.className = 'player-loading';
    loading.innerHTML = '<div class="spinner"></div> Loading audio…';
    container.appendChild(loading);

    // Waveform container
    const waveformDiv = document.createElement('div');
    waveformDiv.className = 'waveform-container';
    waveformDiv.setAttribute('aria-label', `Audio waveform visualizer for ${label}`);
    waveformDiv.style.display = 'none';
    container.appendChild(waveformDiv);

    // Controls row
    const controlsRow = document.createElement('div');
    controlsRow.className = 'player-row';
    controlsRow.style.display = 'none';
    controlsRow.innerHTML = `
    <div class="player-buttons">
      <button class="player-btn" data-action="play" aria-label="Play ${label}" title="Play">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,1 13,8 3,15"/></svg>
      </button>
      <button class="player-btn" data-action="pause" aria-label="Pause ${label}" title="Pause" style="display:none">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/></svg>
      </button>
      <button class="player-btn" data-action="stop" aria-label="Stop ${label}" title="Stop">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
      </button>
    </div>
    <div class="player-seek-area">
      <span class="player-time" data-time="current">00:00</span>
      <input type="range" class="seek-bar" min="0" max="100" value="0" step="0.1"
             aria-label="Seek position for ${label}" />
      <span class="player-time" data-time="duration">00:00</span>
    </div>
    <div class="volume-area">
      <span class="volume-icon" title="Volume" aria-hidden="true">🔊</span>
      <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="0.8"
             aria-label="Volume control for ${label}" />
    </div>
  `;
    container.appendChild(controlsRow);

    // State
    let ws = null;
    let isPlaying = false;
    let isSeeking = false;

    const playBtn = controlsRow.querySelector('[data-action="play"]');
    const pauseBtn = controlsRow.querySelector('[data-action="pause"]');
    const stopBtn = controlsRow.querySelector('[data-action="stop"]');
    const seekBar = controlsRow.querySelector('.seek-bar');
    const currentTimeEl = controlsRow.querySelector('[data-time="current"]');
    const durationEl = controlsRow.querySelector('[data-time="duration"]');
    const volumeSlider = controlsRow.querySelector('.volume-slider');

    function showPlayBtn() {
        playBtn.style.display = '';
        pauseBtn.style.display = 'none';
    }

    function showPauseBtn() {
        playBtn.style.display = 'none';
        pauseBtn.style.display = '';
    }

    function updateWaveformColors(state) {
        if (!ws) return;
        const styles = getComputedStyle(document.documentElement);
        const active = styles.getPropertyValue('--wave-active').trim();
        const idle = styles.getPropertyValue('--wave-idle').trim();

        if (state === 'playing') {
            ws.setOptions({ waveColor: idle, progressColor: active });
        } else if (state === 'paused') {
            ws.setOptions({ waveColor: idle, progressColor: active + 'B3' }); // 70% opacity
        } else {
            ws.setOptions({ waveColor: idle, progressColor: idle });
        }
    }

    // Initialize WaveSurfer
    try {
        ws = WaveSurfer.create({
            container: waveformDiv,
            waveColor: '#2D1F45',
            progressColor: '#2D1F45',
            cursorColor: '#A855F7',
            cursorWidth: 1,
            height: compact ? 48 : 64,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            responsive: true,
            normalize: true,
            backend: 'WebAudio',
        });

        ws.load(src);

        ws.on('ready', () => {
            loading.style.display = 'none';
            waveformDiv.style.display = '';
            controlsRow.style.display = '';
            durationEl.textContent = formatTime(ws.getDuration());
            ws.setVolume(parseFloat(volumeSlider.value));
            updateWaveformColors('stopped');
        });

        ws.on('audioprocess', () => {
            if (!isSeeking) {
                const current = ws.getCurrentTime();
                const duration = ws.getDuration();
                currentTimeEl.textContent = formatTime(current);
                seekBar.value = duration ? (current / duration * 100) : 0;
            }
        });

        ws.on('play', () => {
            isPlaying = true;
            showPauseBtn();
            updateWaveformColors('playing');
            announce(`Playing ${label}`);
            container.dispatchEvent(new CustomEvent('playerStateChange', { detail: { playing: true } }));
        });

        ws.on('pause', () => {
            isPlaying = false;
            showPlayBtn();
            updateWaveformColors('paused');
            announce(`Paused ${label}`);
            container.dispatchEvent(new CustomEvent('playerStateChange', { detail: { playing: false } }));
        });

        ws.on('finish', () => {
            isPlaying = false;
            showPlayBtn();
            updateWaveformColors('stopped');
            container.dispatchEvent(new CustomEvent('playerStateChange', { detail: { playing: false } }));
        });

        ws.on('error', (err) => {
            loading.innerHTML = `<span style="color: var(--color-error)">Failed to load audio</span>`;
            console.error('WaveSurfer error:', err);
        });
    } catch (err) {
        loading.innerHTML = `<span style="color: var(--color-error)">Audio player unavailable</span>`;
        console.error('WaveSurfer init error:', err);
    }

    // Button handlers
    playBtn.addEventListener('click', () => ws?.play());
    pauseBtn.addEventListener('click', () => ws?.pause());
    stopBtn.addEventListener('click', () => {
        ws?.stop();
        isPlaying = false;
        showPlayBtn();
        updateWaveformColors('stopped');
        seekBar.value = 0;
        currentTimeEl.textContent = '00:00';
    });

    // Seek bar
    seekBar.addEventListener('input', () => {
        isSeeking = true;
        const dur = ws?.getDuration() || 0;
        currentTimeEl.textContent = formatTime((seekBar.value / 100) * dur);
    });

    seekBar.addEventListener('change', () => {
        const dur = ws?.getDuration() || 0;
        ws?.seekTo(seekBar.value / 100);
        isSeeking = false;
    });

    // Volume
    volumeSlider.addEventListener('input', () => {
        ws?.setVolume(parseFloat(volumeSlider.value));
    });

    // Keyboard shortcuts
    container.setAttribute('tabindex', '0');
    container.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return; // Don't override sliders
        if (e.code === 'Space') {
            e.preventDefault();
            ws?.playPause();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            const t = (ws?.getCurrentTime() || 0) - 5;
            ws?.seekTo(Math.max(0, t) / (ws?.getDuration() || 1));
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            const dur = ws?.getDuration() || 1;
            const t = (ws?.getCurrentTime() || 0) + 5;
            ws?.seekTo(Math.min(t, dur) / dur);
        }
    });

    return {
        element: container,
        get wavesurfer() { return ws; },
        get isPlaying() { return isPlaying; },
        destroy() {
            ws?.destroy();
        },
    };
}
