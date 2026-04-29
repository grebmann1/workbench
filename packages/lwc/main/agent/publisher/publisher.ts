import { api, track } from 'lwc';
import { isEmpty, isChromeExtension, runActionAfterTimeOut } from 'shared/utils';
import ToolkitElement from 'core/toolkitElement';
import {
    MODELS,
    INTERNAL_MODELS,
    DEFAULT_MODEL,
    DEFAULT_REASONING,
    REASONING_OPTIONS,
} from 'agent/utils';
import { normalizeModelSelection } from 'shared/llm';
import LOGGER from 'shared/logger';

export default class App extends ToolkitElement {
    @track _queuedMessages: Array<{ id: string; prompt: string; isPush?: boolean }> = [];
    _isLoading = false;

    @api
    get isLoading() {
        return this._isLoading;
    }
    set isLoading(value) {
        const prev = this._isLoading;
        this._isLoading = !!value;
        if (prev && !this._isLoading && this._queuedMessages.length > 0) {
            const [next, ...rest] = this._queuedMessages;
            this._queuedMessages = rest;
            this._fireEnqueuedSend(next.prompt);
        }
    }

    @api openaiKey: string | undefined;
    @api isAudioRecorderDisabled = false;
    @api availableModels = MODELS;

    _isInternal = false;
    @api
    get isInternal() {
        return this._isInternal;
    }
    set isInternal(value) {
        this._isInternal = !!value;
    }

    @track selectedModel = DEFAULT_MODEL;
    @track selectedReasoning = DEFAULT_REASONING;

    get resolvedAvailableModels() {
        const providedModels =
            Array.isArray(this.availableModels) && this.availableModels.length > 0
                ? this.availableModels
                : null;
        if (providedModels) {
            return providedModels;
        }
        if (this.isInternal) {
            return INTERNAL_MODELS;
        }
        return MODELS;
    }

    normalizeModelValue = value => {
        const options = this.resolvedAvailableModels;
        const fallback = options[0]?.value || DEFAULT_MODEL;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return normalizeModelSelection(value, options as any, fallback) ?? fallback;
    };

    normalizeReasoningValue = value => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return DEFAULT_REASONING;
        const lowered = raw.toLowerCase();
        const exactValue = REASONING_OPTIONS.find(option => option.value === raw);
        if (exactValue) return exactValue.value;
        const valueCaseInsensitive = REASONING_OPTIONS.find(
            option => String(option.value || '').toLowerCase() === lowered
        );
        if (valueCaseInsensitive) return valueCaseInsensitive.value;
        const labelMatch = REASONING_OPTIONS.find(
            option => String(option.label || '').toLowerCase() === lowered
        );
        return labelMatch ? labelMatch.value : DEFAULT_REASONING;
    };

    @api
    get model() {
        return this.selectedModel;
    }
    set model(val) {
        this.selectedModel = this.normalizeModelValue(val);
    }

    @api
    get reasoning() {
        return this.selectedReasoning;
    }
    set reasoning(val) {
        const normalizedReasoning = this.normalizeReasoningValue(val);
        this.selectedReasoning = normalizedReasoning;
    }

    handleModelChange = event => {
        const model = this.normalizeModelValue(event.target.value);
        this.selectedModel = model;
        this.dispatchEvent(
            new CustomEvent('modelchange', { detail: { model }, bubbles: true, composed: true })
        );
    };

    handleReasoningChange = event => {
        const reasoning = this.normalizeReasoningValue(event.detail?.value ?? event.target?.value);
        this.selectedReasoning = reasoning;
        this.dispatchEvent(
            new CustomEvent('reasoningchange', {
                detail: { reasoning },
                bubbles: true,
                composed: true,
            })
        );
    };

    // prompt
    _prompt: string | null = null;

    // Error
    error_title: string | null = null;
    error_message: string | null = null;
    errorIds: string[] | undefined;

    hasRendered = false;

    selectedFiles: File[] = [];
    imagePreviews: Record<string, string> = {};

    @track dragActive = false;

    @track slashSuggestions: Array<{
        command: string;
        label: string;
        description: string;
        iconName: string;
        key: string;
        isActive: boolean;
        activeClass: string;
    }> = [];
    @track slashActiveIndex = 0;

    _slashCommands = [
        {
            command: 'skill',
            label: '/skill',
            description: 'Browse, edit, or create agent skills',
            iconName: 'utility:magicwand',
        },
    ];

    isSupportedFile = (file: File) => {
        if (!file || !file.type) return false;
        return (
            file.type.startsWith('image/') ||
            file.type === 'application/pdf' ||
            file.type === 'text/csv' ||
            file.type === 'application/json' ||
            file.type === 'text/plain'
        );
    };

    triggerFileInput = () => {
        const fileInput = this.template.querySelector('.file-input') as HTMLInputElement | null;
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    };

    handleFileChange = event => {
        const files = Array.from(event.target.files || []);
        files.forEach(file => {
            if (this.isSupportedFile(file)) {
                if (!this.selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                    this.selectedFiles = [...this.selectedFiles, file];
                    if (file.type.startsWith('image/')) {
                        this.generateImagePreview(file);
                    }
                }
            }
        });
    };

    handleDragOver = event => {
        event.preventDefault();
        this.dragActive = true;
        this.template.querySelector('.file-upload-container')?.classList.add('drag-active');
    };

    handleDragLeave = event => {
        event.preventDefault();
        this.dragActive = false;
        this.template.querySelector('.file-upload-container')?.classList.remove('drag-active');
    };

    handleDrop = event => {
        event.preventDefault();
        this.dragActive = false;
        this.template.querySelector('.file-upload-container')?.classList.remove('drag-active');
        const files = Array.from(event.dataTransfer.files || []);
        files.forEach(file => {
            if (this.isSupportedFile(file)) {
                if (!this.selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                    this.selectedFiles = [...this.selectedFiles, file];
                    if (file.type.startsWith('image/')) {
                        this.generateImagePreview(file);
                    }
                }
            }
        });
    };

    generateImagePreview(file: File) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = e => {
            this.imagePreviews = { ...this.imagePreviews, [file.name]: e.target.result as string };
            this.requestUpdate?.();
        };
        reader.readAsDataURL(file);
    }

    removeSelectedFile = event => {
        const name = event.currentTarget?.dataset?.filename;
        if (!name) return;
        this.selectedFiles = this.selectedFiles.filter(f => f.name !== name);
        const previews = { ...this.imagePreviews };
        delete previews[name];
        this.imagePreviews = previews;
    };

    handleStopClick = () => {
        this.dispatchEvent(new CustomEvent('stop'));
    };

    handlePushClick = () => {
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        const value = textarea?.value || '';
        if (isEmpty(value)) return;
        // Push = priority queue item: inserted at the front so it executes first
        this._queuedMessages = [
            { id: Date.now().toString(), prompt: value.trim(), isPush: true },
            ...this._queuedMessages,
        ];
        this.resetPrompt();
    };

    handleRemoveQueued = event => {
        const id = event.currentTarget?.dataset?.queueId;
        if (!id) return;
        this._queuedMessages = this._queuedMessages.filter(m => m.id !== id);
    };

    handlePromoteQueued = event => {
        const id = event.currentTarget?.dataset?.queueId;
        if (!id) return;
        const item = this._queuedMessages.find(m => m.id === id);
        if (!item) return;
        const rest = this._queuedMessages.filter(m => m.id !== id);
        this._queuedMessages = [{ ...item, isPush: true }, ...rest];
    };

    _fireEnqueuedSend(prompt: string) {
        this.dispatchEvent(
            new CustomEvent('send', {
                detail: {
                    prompt,
                    files: [],
                    model: this.selectedModel,
                    reasoning: this.selectedReasoning,
                },
            })
        );
    }

    @api
    focusInput() {
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.focus();
        }
    }

    resizeTextarea = (textarea?: HTMLTextAreaElement | null) => {
        const target =
            textarea ||
            (this.template.querySelector('.chat-textarea') as HTMLTextAreaElement | null);
        if (!target) {
            return;
        }

        target.style.height = 'auto';
        const computedStyles = getComputedStyle(target);
        const maxHeight = Number.parseFloat(computedStyles.maxHeight) || 160;
        const nextHeight = Math.min(target.scrollHeight, maxHeight);

        target.style.height = `${nextHeight}px`;
        target.style.overflowY = target.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    renderedCallback() {
        const modelOptions = this.resolvedAvailableModels;
        const normalized = this.normalizeModelValue(this.selectedModel);
        this.selectedModel = modelOptions.some(model => model.value === normalized)
            ? normalized
            : modelOptions[0]?.value;
        if (!this.hasRendered) {
            this.hasRendered = true;
            setTimeout(() => {
                this.focusInput();
                this.resizeTextarea();
            }, 300);
        }
    }

    /** Methods **/

    resetError = () => {
        this.error_title = null;
        this.error_message = null;
    };

    resetPrompt = () => {
        this._prompt = null;
        this.selectedFiles = [];
        this.imagePreviews = {};
        this._clearSlashSuggestions();
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value = '';
            this.resizeTextarea(textarea);
        }
        this.focusInput();
    };

    /** Events **/

    handleInputChange = e => {
        this.resizeTextarea(e.target);
        this._updateSlashSuggestions(e.target.value);
        runActionAfterTimeOut(
            e.target.value,
            async newValue => {
                this._prompt = newValue;
            },
            { timeout: 100, key: 'einstein.agent.publisher.inputChange' }
        );
    };

    handleKeyDown = e => {
        if (this.slashSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._moveSlashActive(1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._moveSlashActive(-1);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this._clearSlashSuggestions();
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                this._applySlashSuggestion(this.slashActiveIndex);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent the default behavior of Enter key
            this.handleSendClick();
        }
    };

    handleSlashSuggestionClick = (event: Event) => {
        const index = Number((event.currentTarget as HTMLElement).dataset.index);
        if (Number.isNaN(index)) return;
        this._applySlashSuggestion(index);
    };

    handleSlashSuggestionHover = (event: Event) => {
        const index = Number((event.currentTarget as HTMLElement).dataset.index);
        if (Number.isNaN(index)) return;
        this.slashActiveIndex = index;
        this._refreshSlashActiveState();
    };

    _isSlashInsideQuotes(value: string, slashIndex: number): boolean {
        let inSingle = false;
        let inDouble = false;
        let inBacktick = false;
        for (let i = 0; i < slashIndex; i++) {
            const ch = value[i];
            const prev = i > 0 ? value[i - 1] : '';
            if (prev === '\\') continue;
            if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
            else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
            else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
        }
        return inSingle || inDouble || inBacktick;
    }

    _detectSlashQuery(value: string): string | null {
        if (!value) return null;
        const firstNonWhitespace = value.search(/\S/);
        if (firstNonWhitespace < 0 || value[firstNonWhitespace] !== '/') return null;
        if (this._isSlashInsideQuotes(value, firstNonWhitespace)) return null;
        const rest = value.slice(firstNonWhitespace + 1);
        const match = rest.match(/^([a-z0-9_-]*)/i);
        if (!match) return null;
        const after = rest.slice(match[0].length);
        // Hide suggestions once the user has typed whitespace (e.g. "/skill foo")
        if (after.length > 0 && /\s/.test(after.charAt(0))) return null;
        return match[1].toLowerCase();
    }

    _updateSlashSuggestions(value: string) {
        const query = this._detectSlashQuery(value);
        if (query === null) {
            this._clearSlashSuggestions();
            return;
        }
        const matches = this._slashCommands.filter(cmd => cmd.command.startsWith(query));
        if (matches.length === 0) {
            this._clearSlashSuggestions();
            return;
        }
        this.slashActiveIndex = 0;
        this.slashSuggestions = matches.map((cmd, idx) => ({
            ...cmd,
            key: cmd.command,
            isActive: idx === 0,
            activeClass:
                idx === 0
                    ? 'publisher-slash-item publisher-slash-item_active'
                    : 'publisher-slash-item',
        }));
    }

    _moveSlashActive(delta: number) {
        const total = this.slashSuggestions.length;
        if (total === 0) return;
        this.slashActiveIndex = (this.slashActiveIndex + delta + total) % total;
        this._refreshSlashActiveState();
    }

    _refreshSlashActiveState() {
        this.slashSuggestions = this.slashSuggestions.map((item, idx) => ({
            ...item,
            isActive: idx === this.slashActiveIndex,
            activeClass:
                idx === this.slashActiveIndex
                    ? 'publisher-slash-item publisher-slash-item_active'
                    : 'publisher-slash-item',
        }));
    }

    _applySlashSuggestion(index: number) {
        const suggestion = this.slashSuggestions[index];
        if (!suggestion) return;
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        if (!textarea) return;
        const nextValue = `/${suggestion.command} `;
        textarea.value = nextValue;
        this._prompt = nextValue;
        this.resizeTextarea(textarea);
        this._clearSlashSuggestions();
        textarea.focus();
        textarea.setSelectionRange(nextValue.length, nextValue.length);
    }

    _clearSlashSuggestions() {
        if (this.slashSuggestions.length > 0) {
            this.slashSuggestions = [];
        }
        this.slashActiveIndex = 0;
    }

    get hasSlashSuggestions() {
        return this.slashSuggestions.length > 0;
    }

    handleClearClick = e => {
        this.resetPrompt();
        this.dispatchEvent(new CustomEvent('clear'));
    };

    handleSpeechChange = e => {
        const speech = e.detail.value;
        this._prompt = speech;
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value = speech;
            this.resizeTextarea(textarea);
        }
    };

    _parseSlashCommand(value: string): { command: string; query: string } | null {
        const trimmed = String(value || '').trim();
        if (!trimmed.startsWith('/')) return null;
        const match = trimmed.match(/^\/([a-z][a-z0-9_-]*)\b\s*(.*)$/i);
        if (!match) return null;
        return { command: match[1].toLowerCase(), query: match[2].trim() };
    }

    handleSendClick = async () => {
        const textarea = this.template.querySelector(
            '.chat-textarea'
        ) as HTMLTextAreaElement | null;
        const value = textarea?.value || '';
        if (isEmpty(value) && this.selectedFiles.length === 0) return;

        const slash = this._parseSlashCommand(value);
        if (slash && (slash.command === 'skill' || slash.command === 'skills')) {
            this.dispatchEvent(
                new CustomEvent('skillscommand', {
                    detail: { query: slash.query },
                    bubbles: true,
                    composed: true,
                })
            );
            this.resetPrompt();
            return;
        }

        if (this._isLoading) {
            this._queuedMessages = [
                ...this._queuedMessages,
                { id: Date.now().toString(), prompt: value.trim() },
            ];
            this.resetPrompt();
        } else {
            this.dispatchEvent(
                new CustomEvent('send', {
                    detail: {
                        prompt: value.trim(),
                        files: this.selectedFiles,
                        model: this.selectedModel,
                        reasoning: this.selectedReasoning,
                    },
                })
            );
            this.resetPrompt();
        }
    };

    /** Getters **/

    get hasFiles() {
        return this.selectedFiles.length > 0;
    }
    get filePills() {
        return this.selectedFiles.map(file => ({
            file,
            isImage: file.type && file.type.startsWith('image/'),
            preview: this.imagePreviews[file.name] || '',
        }));
    }

    get isClearButtonDisabled() {
        return false;
    }

    get isSendButtonDisabled() {
        return isEmpty(this._prompt) && this.selectedFiles.length === 0;
    }

    get hasQueuedMessages() {
        return this._queuedMessages.length > 0;
    }

    get queueLabel() {
        return `${this._queuedMessages.length} Queued`;
    }

    get showPushButton() {
        return this._isLoading && !isEmpty(this._prompt);
    }

    get isAudioRecorderDisplayed() {
        return !this.isAudioRecorderDisabled;
    }

    get renderedModelOptions() {
        const selectedModel = this.normalizeModelValue(this.selectedModel);
        return this.resolvedAvailableModels.map(model => {
            const colonIdx = model.label.indexOf(': ');
            const displayLabel = colonIdx !== -1 ? model.label.slice(colonIdx + 2) : model.label;
            const provider =
                (model as { provider?: string }).provider ||
                (colonIdx !== -1 ? model.label.slice(0, colonIdx).toLowerCase() : null);
            return {
                ...model,
                displayLabel,
                provider,
                isSelected: model.value === selectedModel,
            };
        });
    }

    get renderedModelOptionGroups() {
        const options = this.renderedModelOptions;
        const map = new Map<string, { key: string; label: string; options: typeof options }>();
        options.forEach(model => {
            const key = model.provider || 'default';
            if (!map.has(key)) {
                const label = key !== 'default' ? key.charAt(0).toUpperCase() + key.slice(1) : '';
                map.set(key, { key, label, options: [] });
            }
            map.get(key)!.options.push(model);
        });
        return Array.from(map.values());
    }

    get hasMultipleProviderGroups() {
        return this.renderedModelOptionGroups.length > 1;
    }
}
