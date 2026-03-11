/**
 * App entry point — register routes and initialize the SPA router.
 */
import { registerRoute, initRouter } from './router.js';
import { renderWelcome } from './screens/welcome.js';
import { renderUpload } from './screens/upload.js';
import { renderProcessing } from './screens/processing.js';
import { renderResults } from './screens/results.js';
import { renderError } from './screens/error.js';
import './styles/index.css';

// Register all routes
registerRoute('/', renderWelcome);
registerRoute('/upload', renderUpload);
registerRoute('/processing', renderProcessing);
registerRoute('/results', renderResults);
registerRoute('/error', renderError);

// Start the router
initRouter();
