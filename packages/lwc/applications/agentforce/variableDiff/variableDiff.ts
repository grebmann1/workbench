import { api, track } from 'lwc';
import ToolkitElement from 'host-api/element';

interface DiffEntry {
    key: string;
    oldValue: string;
    newValue: string;
    oldClass: string;
    newClass: string;
}

export default class VariableDiff extends ToolkitElement {
    @api previousOutput: string = '';
    @api currentInput: string = '';

    @track private _diffs: DiffEntry[] = [];
    private _lastHash: string = '';

    renderedCallback() {
        this._compute();
    }

    private _compute() {
        const hash = `${this.previousOutput}|${this.currentInput}`;
        if (hash === this._lastHash) return;
        this._lastHash = hash;

        const prev = this._extractVariables(this.previousOutput);
        const curr = this._extractVariables(this.currentInput);
        const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

        this._diffs = Array.from(allKeys)
            .filter(key => prev[key] !== curr[key])
            .map(key => ({
                key,
                oldValue: prev[key] ?? '(none)',
                newValue: curr[key] ?? '(none)',
                oldClass: prev[key] ? 'fsm-detail-var-val old' : 'fsm-detail-var-val',
                newClass: curr[key] ? 'fsm-detail-var-val new' : 'fsm-detail-var-val',
            }));
    }

    private _extractVariables(json: string): Record<string, string> {
        try {
            const parsed = JSON.parse(json);
            if (parsed?.variables) return this._flatten(parsed.variables);
            if (parsed?.context) return this._flatten(parsed.context);
            return this._flatten(parsed);
        } catch {
            return {};
        }
    }

    private _flatten(obj: unknown, prefix: string = ''): Record<string, string> {
        const result: Record<string, string> = {};
        if (!obj || typeof obj !== 'object') return result;
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                Object.assign(result, this._flatten(v, key));
            } else {
                result[key] = JSON.stringify(v);
            }
        }
        return result;
    }

    get hasDiffs(): boolean {
        return this._diffs.length > 0;
    }

    get diffs(): DiffEntry[] {
        return this._diffs;
    }

    get diffCount(): number {
        return this._diffs.length;
    }
}
