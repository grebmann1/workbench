const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('content');

const pendingRequests = new Map();

window.addEventListener('message', event => {
    const data = event.data;

    if (data?.type === 'render' && typeof data.html === 'string') {
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        contentEl.srcdoc = data.html;
        return;
    }

    if (data?.type?.endsWith('_REQUEST') && event.source === contentEl.contentWindow) {
        pendingRequests.set(data.id, event.source);
        window.parent.postMessage(data, '*');
        return;
    }

    if (data?.type?.endsWith('_RESPONSE') && pendingRequests.has(data.id)) {
        const source = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        source.postMessage(data, '*');
    }
});

if (window.parent !== window) {
    window.parent.postMessage({ type: 'sandbox-ready' }, '*');
}
