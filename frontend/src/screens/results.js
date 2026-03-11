/**
 * Results Screen — mini-player, ranked song cards, skeleton loading.
 */
import { navigate, announce } from '../router.js';
import { createBreadcrumb } from '../components/breadcrumb.js';
import { createAudioPlayer } from '../components/audio-player.js';
import { getUploadedFileUrl, getSongStreamUrl } from '../api.js';
import '../styles/results.css';

export function renderResults() {
    const resultsRaw = sessionStorage.getItem('results');
    const uploadedFile = sessionStorage.getItem('uploadedFile');
    const originalFilename = sessionStorage.getItem('originalFilename') || 'Your Track';

    // No results — redirect
    if (!resultsRaw || !uploadedFile) {
        navigate('/upload');
        return document.createElement('div');
    }

    const results = JSON.parse(resultsRaw);

    const screen = document.createElement('div');
    screen.className = 'results-screen';

    // Breadcrumb
    screen.appendChild(createBreadcrumb('results'));

    // Check for empty results
    if (!results || results.length === 0) {
        screen.appendChild(renderEmptyState());
        return screen;
    }

    // Mini-player (uploaded track)
    const miniPlayer = document.createElement('div');
    miniPlayer.className = 'mini-player';
    miniPlayer.innerHTML = `
    <div class="mini-player-header">
      <div class="mini-player-icon">🎵</div>
      <div>
        <div class="mini-player-label">Your uploaded track</div>
        <div class="mini-player-title">${escapeHtml(originalFilename)}</div>
      </div>
    </div>
    <div id="mini-player-audio"></div>
  `;
    screen.appendChild(miniPlayer);

    const uploadedUrl = getUploadedFileUrl(uploadedFile);
    const miniPlayerAudio = createAudioPlayer({
        src: uploadedUrl,
        label: originalFilename,
        compact: true,
    });
    miniPlayer.querySelector('#mini-player-audio').appendChild(miniPlayerAudio.element);

    // Results body
    const body = document.createElement('div');
    body.className = 'results-body';
    body.innerHTML = `<h2 class="results-title">Similar Tracks</h2>`;

    const cardsList = document.createElement('div');
    cardsList.className = 'song-cards-list';
    cardsList.setAttribute('role', 'list');
    cardsList.setAttribute('aria-label', 'Recommended similar tracks');

    // Track active players for auto-collapse
    const players = [];
    let expandedCard = null;

    results.forEach((result, idx) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', `Rank ${result.rank}: ${result.title}`);

        // Header (always visible)
        const header = document.createElement('div');
        header.className = 'song-card-header';
        header.innerHTML = `
      <span class="song-rank">#${result.rank}</span>
      <span class="song-title" title="${escapeHtml(result.title)}">${escapeHtml(result.title)}</span>
      <span class="song-now-playing-icon" aria-hidden="true">♪</span>
      <span class="song-expand-icon" aria-hidden="true">▼</span>
    `;

        // Body (expandable)
        const cardBody = document.createElement('div');
        cardBody.className = 'song-card-body';

        let player = null;

        // Click to expand/collapse
        header.addEventListener('click', () => {
            const isExpanding = !card.classList.contains('expanded');

            // Auto-collapse previous
            if (expandedCard && expandedCard !== card) {
                expandedCard.classList.remove('expanded');
                announce(`Collapsed song card`);
            }

            if (isExpanding) {
                card.classList.add('expanded');
                expandedCard = card;
                announce(`Expanded rank ${result.rank}: ${result.title}`);

                // Lazy-load player
                if (!player) {
                    const songUrl = getSongStreamUrl(result.song_id);
                    player = createAudioPlayer({
                        src: songUrl,
                        label: result.title,
                    });
                    cardBody.appendChild(player.element);
                    players.push({ card, player });

                    // Track playing state for glow
                    player.element.addEventListener('playerStateChange', (e) => {
                        if (e.detail.playing) {
                            // Remove playing from other cards
                            document.querySelectorAll('.song-card.playing').forEach(c => c.classList.remove('playing'));
                            card.classList.add('playing');
                        } else {
                            card.classList.remove('playing');
                        }
                    });
                }
            } else {
                card.classList.remove('expanded');
                expandedCard = null;
            }
        });

        // Keyboard support
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'false');
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
                header.setAttribute('aria-expanded', card.classList.contains('expanded'));
            }
        });

        card.appendChild(header);
        card.appendChild(cardBody);
        cardsList.appendChild(card);
    });

    body.appendChild(cardsList);

    // Navigation
    const nav = document.createElement('div');
    nav.className = 'results-nav';
    nav.innerHTML = `
    <button class="btn btn-secondary" id="btn-start-over" aria-label="Start over from welcome screen">Start Over</button>
    <button class="btn btn-primary" id="btn-upload-another" aria-label="Upload another audio file">Upload Another File</button>
  `;
    body.appendChild(nav);
    screen.appendChild(body);

    // Nav handlers
    screen.querySelector('#btn-start-over').addEventListener('click', () => {
        clearSessionData();
        navigate('/');
    });

    screen.querySelector('#btn-upload-another').addEventListener('click', () => {
        clearSessionData();
        navigate('/upload');
    });

    // Cleanup on unmount
    const observer = new MutationObserver(() => {
        if (!document.body.contains(screen)) {
            miniPlayerAudio.destroy();
            players.forEach(p => p.player.destroy());
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return screen;
}

function renderEmptyState() {
    const el = document.createElement('div');
    el.className = 'results-body';
    el.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <p class="empty-state-text">We couldn't find any close matches for your track.</p>
      <button class="btn btn-primary" id="btn-empty-upload" aria-label="Upload another file">Upload Another File</button>
    </div>
  `;

    el.querySelector('#btn-empty-upload').addEventListener('click', () => {
        clearSessionData();
        navigate('/upload');
    });

    return el;
}

function clearSessionData() {
    sessionStorage.removeItem('jobId');
    sessionStorage.removeItem('uploadedFile');
    sessionStorage.removeItem('originalFilename');
    sessionStorage.removeItem('results');
    sessionStorage.removeItem('processingError');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
