/**
 * Processing Screen — real progress polling with waveform animation.
 */
import { navigate, announce } from '../router.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { getJobStatus } from '../api.js';
import '../styles/processing.css';

export function renderProcessing() {
    const jobId = sessionStorage.getItem('jobId');
    if (!jobId) {
        navigate('/upload');
        return document.createElement('div');
    }

    const screen = document.createElement('div');
    screen.className = 'processing-screen';

    // Breadcrumb
    screen.appendChild(createBreadcrumb('processing'));

    // Body
    const body = document.createElement('div');
    body.className = 'processing-body';

    // Waveform visual
    const visual = document.createElement('div');
    visual.className = 'processing-visual';
    visual.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 9; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        visual.appendChild(bar);
    }
    body.appendChild(visual);

    // Status info
    const info = document.createElement('div');
    info.className = 'processing-info';
    info.innerHTML = `
    <div class="processing-stage" id="stage-label">Preparing...</div>
    <div class="processing-progress">
      <div class="progress-bar-container">
        <div class="progress-bar-fill" id="progress-fill" style="width: 0%" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
      </div>
      <div class="processing-percent" id="progress-percent">0%</div>
    </div>
  `;
    body.appendChild(info);
    screen.appendChild(body);

    // Poll for status
    let pollInterval;
    let lastStage = '';

    function startPolling() {
        pollInterval = setInterval(async () => {
            try {
                const data = await getJobStatus(jobId);

                // Update UI
                const fill = screen.querySelector('#progress-fill');
                const label = screen.querySelector('#stage-label');
                const percent = screen.querySelector('#progress-percent');

                if (fill) {
                    fill.style.width = `${data.progress}%`;
                    fill.setAttribute('aria-valuenow', data.progress);
                }
                if (label && data.stage !== lastStage) {
                    label.textContent = data.stage;
                    announce(data.stage);
                    lastStage = data.stage;
                }
                if (percent) {
                    percent.textContent = `${data.progress}%`;
                }

                // Done?
                if (data.status === 'done') {
                    clearInterval(pollInterval);
                    sessionStorage.setItem('results', JSON.stringify(data.results));
                    setTimeout(() => navigate('/results'), 500);
                }

                // Error?
                if (data.status === 'error') {
                    clearInterval(pollInterval);
                    sessionStorage.setItem('processingError', data.error || 'Processing failed');
                    navigate('/error');
                }
            } catch (err) {
                clearInterval(pollInterval);
                sessionStorage.setItem('processingError', err.message);
                navigate('/error');
            }
        }, 600);
    }

    startPolling();

    // Cleanup on unmount
    const observer = new MutationObserver(() => {
        if (!document.body.contains(screen)) {
            clearInterval(pollInterval);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return screen;
}
