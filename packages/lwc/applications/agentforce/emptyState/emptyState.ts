import { api } from 'lwc';
import ToolkitElement from 'host-api/element';
import {
    getEmptyStateContent,
    type EmptyStateKind,
    type EmptyStateVariant,
} from 'agentforce/shared/emptyStates/emptyStates';

/**
 * Centralized empty / permission-denied / error state for agentforce panels.
 *
 * Three branches per panel: `no-data`, `permission-denied`, `error`. The
 * "no-org" state is **NOT** handled here — that's a host-shell concern.
 *
 * Visual logic (title/message/icon per kind × variant) is encapsulated in
 * the pure `getEmptyStateContent` helper so it can be tested in plain Node.
 *
 * Events:
 *   - `cta`   — fired when the optional CTA button is clicked.
 *   - `retry` — fired when the Retry button is clicked (only rendered when
 *               variant === 'error').
 */
export default class EmptyState extends ToolkitElement {
    @api kind: EmptyStateKind = 'inspector';
    @api state: EmptyStateVariant = 'no-data';
    @api errorMessage: string | null = null;
    @api ctaLabel: string | null = null;

    get content() {
        return getEmptyStateContent(this.kind, this.state, this.errorMessage);
    }

    get title(): string {
        return this.content.title;
    }

    get message(): string {
        return this.content.message;
    }

    get iconName(): string {
        return this.content.iconName;
    }

    get hasCta(): boolean {
        return typeof this.ctaLabel === 'string' && this.ctaLabel.trim().length > 0;
    }

    /**
     * Show the Retry button for failures a refresh can recover from: a
     * generic error, or a feature-unavailable state once the admin enables
     * Agentforce in Setup. Permission/no-data states have no retry value.
     */
    get canRetry(): boolean {
        return this.state === 'error' || this.state === 'feature-unavailable';
    }

    handleCta() {
        this.dispatchEvent(new CustomEvent('cta'));
    }

    handleRetry() {
        this.dispatchEvent(new CustomEvent('retry'));
    }
}
