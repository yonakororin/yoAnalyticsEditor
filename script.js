import { App } from './modules/App.js';
import { DbBrowserModal, ReadmeModal } from './modules/ui/Modal.js';

// Initialize App immediately (module is deferred so DOM is ready)
const app = new App();

// Expose Classes to Window for HTML onclick handlers
window.DbBrowserModal = DbBrowserModal;
window.ReadmeModal = ReadmeModal;
