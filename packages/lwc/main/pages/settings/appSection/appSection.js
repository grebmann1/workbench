import { LightningElement, api, track } from 'lwc';
import { getSettingOptions } from 'host-api/settings';

/**
 * Renders one app's settings section on the Settings > Applications tab.
 *
 * Two modes (mutually exclusive, enforced by the manifest generator):
 *  - `app.settings`: array of declarative entries → generic field renderer.
 *  - `app.settingsComponent`: statically-imported LWC ctor → rendered via
 *    `<lwc:component lwc:is>`. Dynamic components are enabled in the build
 *    (see rollup.extension.mjs `enableDynamicComponents: true`).
 *
 * Both paths receive the shared `@api config` + `@api inputfield_change`
 * so changes flow through the host's existing save/load pipeline
 * unchanged (see pages/settings/app/app.js `inputfield_change`).
 */
export default class AppSection extends LightningElement {
    @api app;
    @api config;
    @api inputfield_change;

    @track resolvedOptions = {};

    connectedCallback() {
        this.resolveDynamicOptions();
    }

    get hasCustomComponent() {
        return !!this.app?.settingsComponent;
    }

    get hasDeclarativeSettings() {
        return Array.isArray(this.app?.settings) && this.app.settings.length > 0;
    }

    get customComponentCtor() {
        return this.app?.settingsComponent;
    }

    get renderedSettings() {
        if (!this.hasDeclarativeSettings) return [];
        return this.app.settings.map(entry => {
            const value = this.config?.[entry.key];
            const options = this.optionsFor(entry);
            return {
                ...entry,
                value,
                checked: entry.type === 'toggle' ? !!value : undefined,
                options,
                isToggle: entry.type === 'toggle',
                isText: entry.type === 'text',
                isPassword: entry.type === 'password',
                isNumber: entry.type === 'number',
                isSelect: entry.type === 'select',
                isMultiselect: entry.type === 'multiselect',
            };
        });
    }

    optionsFor(entry) {
        if (Array.isArray(entry.options)) return entry.options;
        if (typeof entry.options === 'string') {
            return this.resolvedOptions[entry.options] || [];
        }
        return [];
    }

    async resolveDynamicOptions() {
        if (!this.hasDeclarativeSettings) return;
        const providerIds = new Set(
            this.app.settings
                .map(s => s.options)
                .filter(o => typeof o === 'string' && o.length > 0)
        );
        const next = { ...this.resolvedOptions };
        await Promise.all(
            [...providerIds].map(async id => {
                next[id] = await getSettingOptions(id);
            })
        );
        this.resolvedOptions = next;
    }

    handleMultiselectChange = event => {
        // lightning-dual-listbox emits { detail: { value: string[] } }; the
        // host's inputfield_change expects dataset.key on currentTarget and
        // either detail.value or currentTarget.value — pass through as-is.
        this.inputfield_change(event);
    };
}
