import { LightningElement, track } from 'lwc';

import { subscribeAnnouncements, type AnnounceOptions } from 'host-api/announce';

/**
 * Screen-reader live region — one instance mounts in the app shell and
 * relays calls to `host-api/announce::announce()` into the DOM. Two
 * separate aria-live nodes exist so assertive announcements interrupt
 * reliably while polite announcements queue behind whatever the reader
 * is currently speaking. Both regions are visually hidden via
 * `slds-assistive-text` — never show them.
 *
 * The same message must not sit in the DOM forever (some readers won't
 * re-announce if it never changes), so we clear the node ~1.2 s after
 * writing. A second call within that window overwrites the first.
 */
export default class LiveRegion extends LightningElement {
    @track politeMessage = '';
    @track assertiveMessage = '';

    unsubscribe?: () => void;
    politeTimeout?: ReturnType<typeof setTimeout>;
    assertiveTimeout?: ReturnType<typeof setTimeout>;

    connectedCallback(): void {
        this.unsubscribe = subscribeAnnouncements((message: string, options: AnnounceOptions) => {
            if (options.assertive) {
                this.assertiveMessage = message;
                clearTimeout(this.assertiveTimeout);
                this.assertiveTimeout = setTimeout(() => {
                    this.assertiveMessage = '';
                }, 1200);
            } else {
                this.politeMessage = message;
                clearTimeout(this.politeTimeout);
                this.politeTimeout = setTimeout(() => {
                    this.politeMessage = '';
                }, 1200);
            }
        });
    }

    disconnectedCallback(): void {
        this.unsubscribe?.();
        clearTimeout(this.politeTimeout);
        clearTimeout(this.assertiveTimeout);
    }
}
