import { api, track } from 'lwc';
import ToolkitElement from 'host-api/element';

export default class LlmDetail extends ToolkitElement {
    @api stepInput: string = '';
    @api stepOutput: string = '';
    @api duration: number = 0;
    @api tokenCount: number = 0;

    @track private _parseError: boolean = false;
    @track private _parsedInput: any = null;
    @track private _parsedOutput: any = null;
    private _lastHash: string = '';

    renderedCallback() {
        this._parse();
    }

    private _parse() {
        const hash = `${this.stepInput}|${this.stepOutput}`;
        if (hash === this._lastHash) return;
        this._lastHash = hash;
        try {
            this._parsedInput = this.stepInput ? JSON.parse(this.stepInput) : null;
            this._parsedOutput = this.stepOutput ? JSON.parse(this.stepOutput) : null;
            this._parseError = false;
        } catch {
            this._parseError = true;
        }
    }

    get model(): string {
        return this._parsedInput?.model || '';
    }

    get hasTokens(): boolean {
        return this.tokenCount > 0 || !!this._parsedOutput?.tokensUsed;
    }

    get formattedTokens(): string {
        if (this._parsedOutput?.tokensUsed?.total)
            return String(this._parsedOutput.tokensUsed.total);
        return this.tokenCount ? String(this.tokenCount) : '';
    }

    get formattedDuration(): string {
        if (!this.duration) return '';
        return this.duration < 1000
            ? `${this.duration}ms`
            : `${(this.duration / 1000).toFixed(1)}s`;
    }

    get finishReason(): string {
        return this._parsedOutput?.finishReason || '';
    }

    get messages() {
        const msgs = this._parsedInput?.messages;
        if (!Array.isArray(msgs)) return [];
        return msgs.map((m: any, i: number) => ({
            key: `msg-${i}`,
            roleLabel: m.role || 'unknown',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2),
            bubbleClass: `fsm-msg-bubble fsm-msg-${m.role || 'unknown'}`,
        }));
    }

    get hasMessages(): boolean {
        return this.messages.length > 0;
    }

    get hasToolCalls(): boolean {
        return (
            Array.isArray(this._parsedOutput?.toolCalls) && this._parsedOutput.toolCalls.length > 0
        );
    }

    get toolCalls() {
        if (!this._parsedOutput?.toolCalls) return [];
        return this._parsedOutput.toolCalls.map((tc: any, i: number) => ({
            key: `tc-${i}`,
            name: tc.name || 'unknown',
            formattedArgs: JSON.stringify(tc.arguments || {}, null, 2),
        }));
    }

    get assistantResponse(): string {
        if (this._parsedOutput?.response) return this._parsedOutput.response;
        if (this._parsedOutput?.content) return this._parsedOutput.content;
        return '';
    }

    get parseError(): boolean {
        return this._parseError;
    }

    get rawInput(): string {
        try {
            return JSON.stringify(JSON.parse(this.stepInput), null, 2);
        } catch {
            return this.stepInput || '(empty)';
        }
    }

    get rawOutput(): string {
        try {
            return JSON.stringify(JSON.parse(this.stepOutput), null, 2);
        } catch {
            return this.stepOutput || '(empty)';
        }
    }
}
