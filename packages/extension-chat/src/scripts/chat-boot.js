const STYLESHEETS = [
    '/styles/slds-workbench-salesforce.css',
    '/styles/slds-plus.css',
    '/styles/tabulator.min.css',
    '/styles/dashboard.css',
    '/styles/shared.css',
    '/styles/extension.css',
    '/styles/monaco.css',
    '/styles/prism.css',
];

const OPTIONAL_SCRIPTS = [
    { src: '/scripts/googleAnalytic.js', type: 'module' },
    { src: '/libs/prism/prism.js' },
    { src: '/libs/mermaid/mermaid.min.js' },
];

const ORDERED_SCRIPTS = [
    '/libs/localforage/localforage.min.js',
    '/libs/localforage/drivers/chrome.js',
];

function loadStylesheet(href) {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

function loadScript({ src, type }) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        if (type) {
            script.type = type;
        }
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function loadOrderedScripts(sources) {
    for (const src of sources) {
        await loadScript({ src });
    }
}

requestAnimationFrame(async () => {
    const stylesReady = Promise.all(STYLESHEETS.map(loadStylesheet));
    const optionalScriptsReady = Promise.all(OPTIONAL_SCRIPTS.map(loadScript)).catch(error => {
        console.warn('[Workbench Chat] Optional side panel script failed to load', error);
    });
    const orderedScriptsReady = loadOrderedScripts(ORDERED_SCRIPTS).catch(error => {
        console.warn('[Workbench Chat] Side panel storage libraries failed to load', error);
    });

    await Promise.all([stylesReady, orderedScriptsReady]);
    await import('/scripts/main.js');
    await import('/scripts/chat.js');
    await optionalScriptsReady;
});
