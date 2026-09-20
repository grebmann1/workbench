import {
    CODE_LANGUAGE_ALIASES,
    CODE_LANGUAGE_LABELS,
    HIGHLIGHT_CACHE_CHARACTERS,
    HIGHLIGHT_CACHE_ENTRIES,
    MAX_HIGHLIGHT_LENGTH,
} from './constants';

export interface CodeHighlighter {
    languages: Record<string, unknown>;
    highlight(code: string, grammar: unknown, language: string): string;
}

export function normalizeCodeLanguage(language: string): string {
    const name = language.trim().split(/\s+/)[0].toLowerCase();
    return /^[\w-]{1,40}$/.test(name) ? name : 'plain';
}

export function prepareChatMarkdown(markdown: string): string {
    // The bundled parser accepts an open fence at EOF when its last line has a terminator.
    return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
}

/** Cache unchanged fences while a later block streams; bound retained source and markup. */
export class ChatCodeHighlighter {
    private cache = new Map<string, string>();
    private characters = 0;
    private getHighlighter: () => CodeHighlighter | undefined;

    constructor(getHighlighter: () => CodeHighlighter | undefined) {
        this.getHighlighter = getHighlighter;
    }

    clear() {
        this.cache.clear();
        this.characters = 0;
    }

    highlight = (code: string, info = ''): string | undefined => {
        const name = normalizeCodeLanguage(info);
        const language = Object.prototype.hasOwnProperty.call(CODE_LANGUAGE_ALIASES, name)
            ? CODE_LANGUAGE_ALIASES[name]
            : name;
        const prism = this.getHighlighter();
        // Plain text is still displayed immediately, including unknown languages and large output.
        if (
            code.length > MAX_HIGHLIGHT_LENGTH ||
            !prism ||
            !Object.prototype.hasOwnProperty.call(prism.languages, language)
        )
            return;
        const key = `${language}\0${code}`;
        const cached = this.cache.get(key);
        if (cached !== undefined) return cached;
        let html: string;
        try {
            html = prism.highlight(code, prism.languages[language], language);
        } catch {
            return;
        }
        const size = key.length + html.length;
        if (size <= HIGHLIGHT_CACHE_CHARACTERS) {
            while (
                this.cache.size >= HIGHLIGHT_CACHE_ENTRIES ||
                this.characters + size > HIGHLIGHT_CACHE_CHARACTERS
            ) {
                const oldest = this.cache.keys().next().value;
                if (oldest === undefined) break;
                this.characters -= oldest.length + this.cache.get(oldest)!.length;
                this.cache.delete(oldest);
            }
            this.cache.set(key, html);
            this.characters += size;
        }
        return html;
    };
}

type CodeViewState = {
    wrapped: boolean;
    left: number;
    top: number;
    focusedAction?: string;
    focusedCode: boolean;
};

export function captureCodeView(container: Element): CodeViewState[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.chat-code[data-code-index]')).map(
        card => {
            const pre = card.querySelector('pre')!;
            return {
                wrapped: card.classList.contains('chat-code_wrapped'),
                left: pre.scrollLeft,
                top: pre.scrollTop,
                focusedAction:
                    card.querySelector<HTMLButtonElement>('button:focus')?.dataset.codeAction,
                focusedCode: pre.matches(':focus'),
            };
        }
    );
}

/** Native pre/code and small controls replace per-fence LWC component construction. */
export function decorateChatCode(container: Element, previous: CodeViewState[]) {
    container.querySelectorAll<HTMLElement>('pre > code:first-child').forEach((code, index) => {
        const pre = code.parentElement!;
        const languageClass = Array.from(code.classList).find(name => name.startsWith('language-'));
        const language = normalizeCodeLanguage(languageClass?.slice(9) || 'plain');
        const label = Object.prototype.hasOwnProperty.call(CODE_LANGUAGE_LABELS, language)
            ? CODE_LANGUAGE_LABELS[language]
            : language;
        const card = document.createElement('div');
        card.className = 'chat-code';
        card.dataset.codeIndex = String(index);
        const toolbar = document.createElement('div');
        toolbar.className = 'chat-code-toolbar';
        const title = document.createElement('span');
        title.className = 'chat-code-language';
        title.textContent = label;
        toolbar.appendChild(title);
        const state = previous[index];
        for (const [action, text] of [
            ['wrap', 'Wrap lines'],
            ['copy', 'Copy'],
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.codeAction = action;
            button.textContent = text;
            button.setAttribute(
                'aria-label',
                `${action === 'copy' ? 'Copy' : 'Wrap'} ${label} code`
            );
            if (action === 'wrap') button.setAttribute('aria-pressed', String(!!state?.wrapped));
            if (action === 'copy') button.setAttribute('aria-live', 'polite');
            toolbar.appendChild(button);
        }
        pre.replaceWith(card);
        card.append(toolbar, pre);
        pre.tabIndex = 0;
        pre.setAttribute('aria-label', `${label} code`);
        card.classList.toggle('chat-code_wrapped', !!state?.wrapped);
        pre.scrollLeft = state?.left || 0;
        pre.scrollTop = state?.top || 0;
        if (state?.focusedCode) pre.focus({ preventScroll: true });
        if (state?.focusedAction) {
            Array.from(toolbar.querySelectorAll('button'))
                .find(button => button.dataset.codeAction === state.focusedAction)
                ?.focus({ preventScroll: true });
        }
    });
}
