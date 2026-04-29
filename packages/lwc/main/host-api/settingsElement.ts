/**
 * Base class for an app's Settings panel.
 *
 * Apps that want a dedicated section under Settings > Applications set
 * `"settingsComponent": "<id>/appSettings"` in their manifest and extend
 * this class. The host mounts the component via `<lwc:component lwc:is>`
 * inside the Applications tab's vertical tabset and passes `config`,
 * `inputfield_change`, and the aggregated manifest entry as `@api` props.
 *
 * Changes flow back through `inputfield_change` — the same contract the
 * Settings page uses for every other input — so the save/load pipeline in
 * pages/settings/app/app.js stays unchanged.
 *
 * Intentionally written without TypeScript parameter/return annotations:
 * the LWC compiler can request `host-api/*` modules via a query-stringified
 * path that bypasses the strip-typescript rollup plugin. Decorator syntax
 * is safe (separate @babel/plugin-syntax-decorators), plain type
 * annotations are not.
 */
import { LightningElement, api } from 'lwc';

export default class AppSettingsElement extends LightningElement {
    /** Full host config map keyed by CACHE_CONFIG.*.key. Treat as read-only. */
    @api config;
    /** Host change handler. Subclasses bind it directly on lightning inputs
     *  as `onchange={inputfield_change}`, or call `updateConfig(key, value)`
     *  when they need to push a value without a DOM event. */
    @api inputfield_change;
    /** Aggregated manifest entry for this app (label, quickActionIcon, …). */
    @api app;

    /** Read a config value with an optional fallback when the key is unset. */
    getConfigValue(key, fallback) {
        const value = this.config && this.config[key];
        return value === undefined ? fallback : value;
    }

    /**
     * Push a value into the host config through the same change pipeline
     * a `<lightning-input onchange>` would use. Synthesises the minimum
     * shape `inputfield_change` expects: `currentTarget.dataset.key`,
     * `currentTarget.value`, and `detail.value|checked`.
     */
    updateConfig(key, value) {
        if (typeof this.inputfield_change !== 'function') return;
        const isBoolean = typeof value === 'boolean';
        this.inputfield_change({
            currentTarget: {
                dataset: { key },
                value,
                type: isBoolean ? 'checkbox' : 'text',
            },
            detail: { value, checked: value },
        });
    }
}
