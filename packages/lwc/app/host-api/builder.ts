/**
 * Host-owned builder components (save dialog + storage categories).
 *
 * Re-exports via module aliases so the underlying LWC templates are still
 * picked up by the LWC compiler. Extensions use these instead of reaching
 * into `component/builder/*` directly.
 */
export { default as SaveModal } from 'builder/saveModal';
export { CATEGORY_STORAGE } from 'builder/storagePanel';
