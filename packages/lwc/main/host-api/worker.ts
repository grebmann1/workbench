/**
 * Host-owned web-worker registry. Extensions acquire a named worker via
 * `getWorker(conn, name)` instead of importing `core/worker`.
 */
export { getWorker, getWorkerStatuses, getAllWorkers } from 'core/worker';
