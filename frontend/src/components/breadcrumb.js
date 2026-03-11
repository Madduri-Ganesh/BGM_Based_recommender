/**
 * Breadcrumb / Stepper component — numbered circles connected by lines.
 * Steps: 1. Upload → 2. Processing → 3. Results
 */

const STEPS = ['Upload', 'Processing', 'Results'];

/**
 * @param {'upload'|'processing'|'results'} currentStep
 * @returns {HTMLElement}
 */
export function createBreadcrumb(currentStep) {
    const stepMap = { upload: 0, processing: 1, results: 2 };
    const currentIdx = stepMap[currentStep] ?? 0;

    // Wrapper: home button + stepper
    const wrapper = document.createElement('div');
    wrapper.className = 'stepper-header';

    const homeBtn = document.createElement('button');
    homeBtn.className = 'stepper-home-btn';
    homeBtn.setAttribute('aria-label', 'Go to welcome screen');
    homeBtn.title = 'Home';
    homeBtn.innerHTML = `<svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.5L2 9h2.5v7h4v-4h3v4h4V9H18L10 2.5z"/></svg>`;
    homeBtn.addEventListener('click', () => { window.location.hash = '/'; });
    wrapper.appendChild(homeBtn);

    const nav = document.createElement('nav');
    nav.className = 'stepper';
    nav.setAttribute('aria-label', 'Progress steps');

    STEPS.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'stepper-item';
        if (i < currentIdx) item.classList.add('completed');
        else if (i === currentIdx) item.classList.add('active');

        const circle = document.createElement('div');
        circle.className = 'stepper-circle';
        circle.textContent = i + 1;
        circle.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'stepper-label';
        label.textContent = step;
        if (i === currentIdx) label.setAttribute('aria-current', 'step');

        item.appendChild(circle);
        item.appendChild(label);
        nav.appendChild(item);

        if (i < STEPS.length - 1) {
            const line = document.createElement('div');
            line.className = 'stepper-line';
            if (i < currentIdx) line.classList.add('completed');
            line.setAttribute('aria-hidden', 'true');
            nav.appendChild(line);
        }
    });

    wrapper.appendChild(nav);
    return wrapper;
}
