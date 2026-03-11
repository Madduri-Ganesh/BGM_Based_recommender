/**
 * SPA Router — hash-based navigation with animated transitions.
 */
const routes = {};
let currentScreen = null;

export function registerRoute(path, renderFn) {
    routes[path] = renderFn;
}

export function navigate(path) {
    window.location.hash = path;
}

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const renderFn = routes[hash];
    if (!renderFn) return;

    const app = document.getElementById('app');

    // Fade out current screen
    if (currentScreen) {
        currentScreen.classList.add('screen-exit');
        await new Promise(r => setTimeout(r, 200));
    }

    // Render new screen
    app.innerHTML = '';
    const screen = renderFn();
    screen.classList.add('screen');
    app.appendChild(screen);
    currentScreen = screen;

    // Announce to screen readers
    announce(`Navigated to ${hash.replace('/', '') || 'welcome'} screen`);
}

export function announce(message) {
    const el = document.getElementById('sr-announcer');
    if (el) {
        el.textContent = '';
        setTimeout(() => { el.textContent = message; }, 100);
    }
}
