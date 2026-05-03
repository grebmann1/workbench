import AppSettingsElement from 'host-api/settingsElement';

type SnippetLanguageRow = { value: string; label: string; enabled: boolean };

/**
 * API Explorer settings panel. All keys live in
 * `shared/cacheManager.CACHE_CONFIG.API_*` — changing a value persists
 * through the host's `inputfield_change` → cacheManager flow; no ad-hoc
 * save calls from inside the app.
 */
export default class ApiAppSettings extends AppSettingsElement {
    /* ------------------------------------------------------------------ */
    /*  Layout                                                             */
    /* ------------------------------------------------------------------ */

    get isSplitterHorizontal(): boolean {
        return !!(this.config && this.config.api_splitter_is_horizontal);
    }

    /* ------------------------------------------------------------------ */
    /*  Defaults                                                           */
    /* ------------------------------------------------------------------ */

    get defaultApiVersion(): string {
        return this.config?.api_default_version ?? '59.0';
    }

    get defaultContentType(): string {
        return this.config?.api_default_content_type ?? 'application/json';
    }

    get defaultContentTypeOptions() {
        return [
            { label: 'application/json', value: 'application/json' },
            { label: 'application/xml', value: 'application/xml' },
            { label: 'text/plain', value: 'text/plain' },
            { label: 'application/graphql', value: 'application/graphql' },
            {
                label: 'application/x-www-form-urlencoded',
                value: 'application/x-www-form-urlencoded',
            },
            { label: 'multipart/form-data', value: 'multipart/form-data' },
        ];
    }

    get defaultTimeoutMs(): number {
        return Number(this.config?.api_default_timeout_ms ?? 30000);
    }

    get abortOnNavigate(): boolean {
        return this.config?.api_abort_on_navigate !== false;
    }

    /* ------------------------------------------------------------------ */
    /*  Response handling                                                  */
    /* ------------------------------------------------------------------ */

    get previewByteThreshold(): number {
        return Number(this.config?.api_preview_byte_threshold ?? 100_000);
    }

    get autoPrettifyJson(): boolean {
        return this.config?.api_auto_prettify_json !== false;
    }

    get autoPrettifyXml(): boolean {
        return this.config?.api_auto_prettify_xml !== false;
    }

    /* ------------------------------------------------------------------ */
    /*  Redaction                                                          */
    /* ------------------------------------------------------------------ */

    get redactHeadersText(): string {
        const list: string[] = Array.isArray(this.config?.api_redact_headers_v1)
            ? this.config.api_redact_headers_v1
            : [];
        return list.join('\n');
    }

    handleRedactHeadersChange = (e: CustomEvent) => {
        const value = (e.currentTarget as any).value || '';
        const list = String(value)
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        // Inject into config flow: the host's inputfield_change expects a
        // single key/value change off a DOM element. We synthesise a detail
        // update since our list isn't captured by a primitive input.
        const patched = { ...(this.config || {}), api_redact_headers_v1: list };
        (this as any).config = patched;
        this.dispatchEvent(
            new CustomEvent('configchange', {
                detail: { key: 'api_redact_headers_v1', value: list },
                bubbles: true,
                composed: true,
            })
        );
    };

    /* ------------------------------------------------------------------ */
    /*  Snippets                                                           */
    /* ------------------------------------------------------------------ */

    get snippetDefaultLanguage(): string {
        return this.config?.api_snippet_default_language ?? 'curl';
    }

    get snippetLanguageOptions() {
        return [
            { label: 'Apex', value: 'apex' },
            { label: 'cURL', value: 'curl' },
            { label: 'jsforce', value: 'jsforce' },
            { label: 'Node fetch', value: 'fetch' },
            { label: 'Python (requests)', value: 'python' },
            { label: 'PowerShell', value: 'powershell' },
        ];
    }

    get snippetLanguageRows(): SnippetLanguageRow[] {
        const enabled: string[] = Array.isArray(this.config?.api_snippet_enabled_languages)
            ? this.config.api_snippet_enabled_languages
            : [];
        return this.snippetLanguageOptions.map(opt => ({
            ...opt,
            enabled: enabled.includes(opt.value),
        }));
    }

    handleSnippetLanguageToggle = (e: CustomEvent) => {
        const target = e.currentTarget as any;
        const { key } = target.dataset;
        const current: string[] = Array.isArray(
            this.config?.api_snippet_enabled_languages
        )
            ? [...this.config.api_snippet_enabled_languages]
            : [];
        const checked = !!target.checked;
        const idx = current.indexOf(key);
        if (checked && idx < 0) current.push(key);
        if (!checked && idx >= 0) current.splice(idx, 1);
        const patched = {
            ...(this.config || {}),
            api_snippet_enabled_languages: current,
        };
        (this as any).config = patched;
        this.dispatchEvent(
            new CustomEvent('configchange', {
                detail: { key: 'api_snippet_enabled_languages', value: current },
                bubbles: true,
                composed: true,
            })
        );
    };

    /* ------------------------------------------------------------------ */
    /*  Agent integration                                                  */
    /* ------------------------------------------------------------------ */

    get agentToolEnabled(): boolean {
        return this.config?.api_agent_tool_enabled !== false;
    }
}
