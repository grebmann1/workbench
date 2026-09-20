/** Serialized by chrome.scripting: keep this function independent of module scope. */
export function runPageOperation(request) {
    const { limits } = request;
    const normalize = value =>
        String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    const visible = element => {
        const style = getComputedStyle(element);
        return (
            (element.getClientRects().length > 0 || style.display === 'contents') &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            !element.closest('[hidden], [inert], [aria-hidden="true"]')
        );
    };
    const inViewport = rect =>
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    const sensitive = element =>
        /^(password|file|hidden)$/i.test(element.type || '') ||
        /password|one-time-code|cc-|transaction-/i.test(element.autocomplete || '') ||
        /password|passcode|credit.?card|card.?number|security.?code|\bcvv\b|\bcvc\b|\botp\b/i.test(
            [element.name, element.id, element.getAttribute('aria-label')].join(' ')
        );
    const label = element => {
        const root = element.getRootNode();
        const labelledBy = (element.getAttribute('aria-labelledby') || '')
            .split(/\s+/)
            .map(id => root.getElementById?.(id)?.textContent || '')
            .join(' ');
        return normalize(
            element.getAttribute('aria-label') ||
                labelledBy.trim() ||
                Array.from(element.labels || [])
                    .map(item => item.textContent)
                    .join(' ') ||
                element.getAttribute('alt') ||
                element.getAttribute('title') ||
                element.getAttribute('placeholder') ||
                (element.matches('input, textarea, select') ? element.name : element.textContent)
        ).slice(0, limits.label);
    };
    const fingerprint = element =>
        JSON.stringify([
            element.tagName,
            element.getAttribute('role'),
            element.type,
            label(element),
            element.getAttribute('href'),
            element.form?.action,
            sensitive(element) ? undefined : element.value,
            element.checked,
        ]);
    const stateKey = '__workbenchStructuredBrowser';
    const previous = globalThis[stateKey];
    if (request.action !== 'snapshot') {
        if (!previous || previous.url !== location.href || previous.id !== request.snapshotId) {
            throw new Error(
                'The page or snapshot changed. Read a fresh browser_snapshot before acting.'
            );
        }
        let element;
        if (request.ref) {
            const entry = previous.refs.get(request.ref);
            element = entry?.element;
            if (
                !element?.isConnected ||
                !visible(element) ||
                entry.fingerprint !== fingerprint(element)
            ) {
                throw new Error(
                    'This element changed or disappeared. Read a fresh browser_snapshot.'
                );
            }
            if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') {
                throw new Error('This control is disabled.');
            }
            if (sensitive(element))
                throw new Error('Complete this sensitive field yourself in the browser.');
        }
        // Consume the snapshot before dispatching events: a failed/partial write must not be replayed.
        delete globalThis[stateKey];
        if (request.action === 'click') {
            const link = element.closest('a[href]');
            if (link && !/^https?:$/.test(new URL(link.href).protocol)) {
                throw new Error('Only HTTP and HTTPS links can be opened.');
            }
            element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            const rect = element.getBoundingClientRect();
            const root = element.getRootNode();
            const hit = root.elementFromPoint?.(rect.x + rect.width / 2, rect.y + rect.height / 2);
            if (hit && hit !== element && !element.contains(hit)) {
                throw new Error(
                    'This element is covered by another control. Read a fresh snapshot.'
                );
            }
            element.click();
        } else if (request.action === 'fill') {
            if (
                !element.matches('input, textarea') ||
                element.readOnly ||
                (element.tagName === 'INPUT' &&
                    !/^(text|search|email|url|tel|number|date|datetime-local|month|week|time)$/i.test(
                        element.type
                    ))
            ) {
                throw new Error('This control is not an editable text field.');
            }
            const prototype =
                element.tagName === 'TEXTAREA'
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype;
            element.focus();
            Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, request.value);
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else if (request.action === 'select') {
            if (element.tagName !== 'SELECT')
                throw new Error('This control is not a native select.');
            const option = Array.from(element.options).find(item => item.value === request.value);
            if (!option || option.disabled || option.parentElement?.disabled) {
                throw new Error('That option is missing or disabled.');
            }
            element.value = request.value;
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else if (request.action === 'scroll') {
            const target = element || document.scrollingElement;
            target.scrollBy({
                top: request.direction === 'up' ? -innerHeight * 0.8 : innerHeight * 0.8,
                behavior: 'instant',
            });
        } else {
            throw new Error('Unsupported browser action.');
        }
    }

    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), value =>
        value.toString(16)
    ).join('-');
    const refs = new Map();
    const elements = [];
    const text = [];
    const frames = [];
    let textLength = 0;
    let visited = 0;
    let truncated = false;
    const walk = node => {
        if (!node) return;
        if (++visited > limits.nodes) {
            truncated = true;
            return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            range.selectNodeContents(node);
            if (!inViewport(range.getBoundingClientRect())) return;
            const value = normalize(node.textContent);
            if (value && textLength < limits.text) {
                text.push(value.slice(0, limits.text - textLength));
                textLength += value.length + 1;
            }
            if (textLength >= limits.text) truncated = true;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
            return;
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches('script, style, noscript, template') || !visible(node)) return;
            if (node.matches('iframe') && frames.length < 20)
                frames.push({
                    title: node.title.slice(0, limits.label),
                    url: node.src.slice(0, limits.url),
                });
            if (
                inViewport(node.getBoundingClientRect()) &&
                node.matches(
                    'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role], [tabindex], h1, h2, h3'
                )
            ) {
                if (elements.length < limits.elements) {
                    const ref = `${id}:${elements.length + 1}`;
                    refs.set(ref, { element: node, fingerprint: fingerprint(node) });
                    const item = {
                        ref,
                        tag: node.tagName.toLowerCase(),
                        role: node.getAttribute('role'),
                        name: label(node),
                        type: node.type || undefined,
                        disabled:
                            node.matches(':disabled') ||
                            node.getAttribute('aria-disabled') === 'true',
                    };
                    if (sensitive(node)) item.sensitive = true;
                    else if (node.matches('input, textarea, select')) {
                        item.value = String(node.value).slice(0, limits.label);
                        if (node.matches('input[type="checkbox"], input[type="radio"]'))
                            item.checked = node.checked;
                        if (node.matches('select'))
                            item.options = Array.from(node.options)
                                .slice(0, 40)
                                .map(option => ({
                                    label: normalize(option.label).slice(0, limits.label),
                                    value: option.value.slice(0, 1000),
                                    disabled: option.disabled,
                                }));
                    }
                    if (node.matches('a[href]'))
                        item.url =
                            node.href.length <= limits.url
                                ? node.href
                                : '[URL too long; inspect with browser runtime]';
                    elements.push(item);
                } else truncated = true;
            }
            if (sensitive(node) || node.matches('textarea, [contenteditable="true"]')) return;
        }
        for (const child of node.childNodes) {
            if (visited >= limits.nodes) {
                truncated = true;
                break;
            }
            walk(child);
        }
        if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document.body);
    globalThis[stateKey] = { id, url: location.href, refs };
    return {
        snapshotId: id,
        url: location.href,
        title: document.title.slice(0, limits.label),
        readyState: document.readyState,
        text: text.join('\n'),
        elements,
        frames,
        truncated,
        scroll: {
            x: scrollX,
            y: scrollY,
            height: innerHeight,
            totalHeight: document.scrollingElement?.scrollHeight,
        },
    };
}
