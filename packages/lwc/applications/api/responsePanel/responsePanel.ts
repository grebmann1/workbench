import { LightningElement, api } from 'lwc';
import { formatBytes } from 'shared/utils';

/**
 * Presentational wrapper around the API response viewer area. This panel is
 * deliberately additive — the existing app.ts can migrate to it incrementally.
 * All state is owned by the parent (app.ts); this component only emits events.
 *
 * Inputs:
 *   @api viewer              — current viewer mode ('Pretty' | 'Raw' | 'Workbench' | 'Preview' | 'Snippet')
 *   @api status              — HTTP status code
 *   @api durationMs          — wall-clock duration
 *   @api size                — response size in bytes
 *   @api contentType         — MIME string
 *   @api contentHeaders      — [{key,value}]
 *   @api previewByteThreshold — responses larger than this trigger download-only mode
 *
 * Events:
 *   viewerchange  — detail: { value }
 *   download
 *   copy
 *   search        — detail: { query, mode }
 */
export default class ResponsePanel extends LightningElement {
    @api viewer = 'Pretty';
    @api status: number | null = null;
    @api durationMs: number | null = null;
    @api size: number | null = null;
    @api contentType = '';
    @api contentHeaders: Array<{ key: string; value: string }> = [];
    @api previewByteThreshold = 100_000;

    handleViewerChange(e: CustomEvent) {
        const value = (e.currentTarget as any).value;
        this.dispatchEvent(
            new CustomEvent('viewerchange', { detail: { value }, bubbles: true, composed: true })
        );
    }

    handleDownload() {
        this.dispatchEvent(new CustomEvent('download'));
    }

    handleCopy() {
        this.dispatchEvent(new CustomEvent('copy'));
    }

    handleSearch(e: CustomEvent) {
        const target = e.currentTarget as any;
        this.dispatchEvent(
            new CustomEvent('search', {
                detail: { query: target.value, mode: target.dataset.mode || 'substring' },
            })
        );
    }

    get formattedSize(): string {
        return this.size != null ? formatBytes(this.size) : '';
    }

    get isLargeResponse(): boolean {
        return (this.size ?? 0) > this.previewByteThreshold;
    }

    get viewerOptions() {
        return [
            { label: 'Pretty', value: 'Pretty' },
            { label: 'Raw', value: 'Raw' },
            { label: 'Workbench', value: 'Workbench' },
            { label: 'Preview', value: 'Preview' },
            { label: 'Snippet', value: 'Snippet' },
        ];
    }

    get statusBadgeClass(): string {
        const s = this.status || 0;
        if (s >= 200 && s < 300) return 'slds-badge slds-theme_success';
        if (s >= 300 && s < 400) return 'slds-badge slds-theme_warning';
        if (s >= 400) return 'slds-badge slds-theme_error';
        return 'slds-badge';
    }
}
