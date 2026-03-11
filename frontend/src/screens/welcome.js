/**
 * Welcome Screen — full-screen hero with radiant purple glow and CTA.
 */
import { navigate } from '../router.js';
import '../styles/welcome.css';

export function renderWelcome() {
    const screen = document.createElement('div');
    screen.className = 'welcome-screen';

    // Radiant glow background layers
    const glow = document.createElement('div');
    glow.className = 'welcome-glow';
    glow.setAttribute('aria-hidden', 'true');
    screen.appendChild(glow);

    const rays = document.createElement('div');
    rays.className = 'welcome-rays';
    rays.setAttribute('aria-hidden', 'true');
    screen.appendChild(rays);

    const floor = document.createElement('div');
    floor.className = 'welcome-floor';
    floor.setAttribute('aria-hidden', 'true');
    screen.appendChild(floor);

    // Content
    const content = document.createElement('div');
    content.className = 'welcome-content';
    content.innerHTML = `
    <h1 class="welcome-title">BGM Recommender</h1>
    <p class="welcome-subtitle">Find music that sounds like yours</p>
    <button class="btn btn-primary welcome-cta" id="btn-get-started" aria-label="Get started — upload your music">
      Get Started
    </button>
  `;
    screen.appendChild(content);

    // CTA handler
    content.querySelector('#btn-get-started').addEventListener('click', () => {
        navigate('/upload');
    });

    return screen;
}
