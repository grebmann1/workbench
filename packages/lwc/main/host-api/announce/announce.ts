/**
 * Screen-reader announcements.
 *
 * Most user-visible state changes in Workbench (session expiry, streaming
 * message chunks, SOQL row-count updates, wizard step transitions) happen
 * in code paths that aren't the target of keyboard focus, so sighted-only
 * affordances leave assistive-tech users out of the loop. A single live
 * region at the app shell level, driven by an `announce()` primitive,
 * fixes that without every component rolling its own `role="status"` div.
 *
 * Contract:
 *  - `announce(message)` — polite. Speaks when the screen reader is idle.
 *  - `announce(message, { assertive: true })` — assertive. Interrupts.
 *  - Messages are deduped back-to-back (same message within 500 ms is
 *    dropped) so repeated state changes don't spam the reader.
 *  - A component hosts the actual DOM live region and subscribes via
 *    `subscribeAnnouncements(listener)`. Only one active subscriber is
 *    expected (the shell's `liveRegion`); subsequent subscribers replace
 *    the previous — this is deliberate so hot-reload works.
 */

export type AnnounceOptions = { assertive?: boolean };

type AnnouncementListener = (message: string, options: AnnounceOptions) => void;

let listener: AnnouncementListener | null = null;
let lastMessage = '';
let lastAt = 0;
const DEDUPE_WINDOW_MS = 500;

export function announce(message: string, options: AnnounceOptions = {}): void {
    if (!message || typeof message !== 'string') return;
    const now = Date.now();
    if (message === lastMessage && now - lastAt < DEDUPE_WINDOW_MS) return;
    lastMessage = message;
    lastAt = now;
    if (listener) listener(message, options);
}

export function subscribeAnnouncements(fn: AnnouncementListener): () => void {
    listener = fn;
    return () => {
        if (listener === fn) listener = null;
    };
}

export function __resetAnnounceForTests(): void {
    listener = null;
    lastMessage = '';
    lastAt = 0;
}
