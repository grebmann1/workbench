/**
 * Host-owned IndexedDB filesystem accessor. Extensions call
 * `getIndexedDbFileSystem()` to borrow the shared browser-side FS without
 * reaching into `core/fs`.
 */
export { getIndexedDbFileSystem } from 'core/fs';
