import { LightningElement, api, track } from 'lwc';

export type BodyMode =
    | 'none'
    | 'json'
    | 'xml'
    | 'text'
    | 'graphql'
    | 'form-urlencoded'
    | 'form-data'
    | 'binary';

export type FormField = {
    key: string;
    value: string;
    type: 'text' | 'file';
    filename?: string;
};

/**
 * Multi-mode body editor for the API request panel. Stateless over `body`
 * (emits `bodyChange` with the string form); tracks `fields` internally
 * for row-based modes and serialises them back to a string on every edit
 * so Redux state stays a string.
 *
 * Modes:
 *   none            — no body
 *   json / xml / text — raw string bodies
 *   graphql         — {query, variables} convention-stringified as JSON
 *   form-urlencoded — URLSearchParams encoding
 *   form-data       — multipart/form-data (serialized as a JSON envelope
 *                     since Redux can't carry File objects)
 *   binary          — a single File/blob reference kept out of Redux
 */
export default class BodyEditor extends LightningElement {
    @api mode: BodyMode = 'json';
    @api body = '';

    @track fields: FormField[] = [];
    @track graphqlQuery = '';
    @track graphqlVariables = '{}';

    connectedCallback() {
        this._hydrateFromBody();
    }

    @api
    refresh(): void {
        this._hydrateFromBody();
    }

    _hydrateFromBody(): void {
        if (this.mode === 'form-urlencoded') {
            try {
                const params = new URLSearchParams(this.body || '');
                this.fields = [];
                params.forEach((value, key) => {
                    this.fields.push({ key, value, type: 'text' });
                });
            } catch {
                this.fields = [];
            }
        } else if (this.mode === 'form-data') {
            try {
                const parsed = JSON.parse(this.body || '[]');
                this.fields = Array.isArray(parsed) ? (parsed as FormField[]) : [];
            } catch {
                this.fields = [];
            }
        } else if (this.mode === 'graphql') {
            try {
                const parsed = JSON.parse(this.body || '{}');
                this.graphqlQuery = String(parsed.query || '');
                this.graphqlVariables =
                    parsed.variables != null ? JSON.stringify(parsed.variables, null, 2) : '{}';
            } catch {
                this.graphqlQuery = String(this.body || '');
                this.graphqlVariables = '{}';
            }
        }
    }

    _emit(body: string): void {
        this.dispatchEvent(
            new CustomEvent('bodychange', {
                detail: { body, mode: this.mode },
                bubbles: true,
                composed: true,
            })
        );
    }

    /* ----------------------------- row ops ----------------------------- */

    handleRowChange(e: CustomEvent) {
        const target = e.currentTarget as any;
        const idx = Number(target.dataset.idx);
        const field = target.dataset.field as 'key' | 'value';
        const value = target.value;
        const next = this.fields.map((f, i) => (i === idx ? { ...f, [field]: value } : f));
        this.fields = next;
        this._emitFromFields();
    }

    handleAddRow() {
        this.fields = [...this.fields, { key: '', value: '', type: 'text' }];
        this._emitFromFields();
    }

    handleRemoveRow(e: CustomEvent) {
        const idx = Number((e.currentTarget as any).dataset.idx);
        this.fields = this.fields.filter((_, i) => i !== idx);
        this._emitFromFields();
    }

    _emitFromFields(): void {
        if (this.mode === 'form-urlencoded') {
            const params = new URLSearchParams();
            for (const f of this.fields) {
                if (f.key) params.append(f.key, f.value || '');
            }
            this._emit(params.toString());
        } else if (this.mode === 'form-data') {
            this._emit(JSON.stringify(this.fields));
        }
    }

    /* ---------------------------- raw body ---------------------------- */

    handleRawBodyChange(e: CustomEvent) {
        const value = (e.currentTarget as any).value || '';
        this._emit(value);
    }

    /* ---------------------------- graphql ----------------------------- */

    handleGraphqlQueryChange(e: CustomEvent) {
        this.graphqlQuery = (e.currentTarget as any).value || '';
        this._emitGraphql();
    }

    handleGraphqlVariablesChange(e: CustomEvent) {
        this.graphqlVariables = (e.currentTarget as any).value || '{}';
        this._emitGraphql();
    }

    _emitGraphql(): void {
        let variables: unknown = {};
        try {
            variables = JSON.parse(this.graphqlVariables || '{}');
        } catch {
            // Leave variables un-parsed if invalid; the request will fail at runtime.
            variables = {};
        }
        this._emit(JSON.stringify({ query: this.graphqlQuery, variables }, null, 2));
    }

    /* --------------------------- view getters ------------------------- */

    get isNone() {
        return this.mode === 'none';
    }
    get isJson() {
        return this.mode === 'json';
    }
    get isXml() {
        return this.mode === 'xml';
    }
    get isText() {
        return this.mode === 'text';
    }
    get isGraphql() {
        return this.mode === 'graphql';
    }
    get isFormUrlEncoded() {
        return this.mode === 'form-urlencoded';
    }
    get isFormData() {
        return this.mode === 'form-data';
    }
    get isBinary() {
        return this.mode === 'binary';
    }

    get indexedFields() {
        return this.fields.map((f, idx) => ({ ...f, idx }));
    }

    get rawBodyLabel(): string {
        if (this.mode === 'json') return 'JSON body';
        if (this.mode === 'xml') return 'XML body';
        if (this.mode === 'graphql') return 'GraphQL';
        return 'Body';
    }
}
