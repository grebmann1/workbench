export const SCREENSHOTS = [
    {
        id: 'overlay',
        time: 16,
        label: 'Salesforce overlay',
        title: 'Your tools. Right inside Salesforce.',
        detail: 'Find objects and open org tools without leaving the record.',
        accent: '#90d0fe',
    },
    {
        id: 'soql',
        time: 28,
        label: 'SOQL Explorer',
        title: 'Query your data. See the answer.',
        detail: 'Write SOQL, run queries, and inspect the results in one workspace.',
        accent: '#90d0fe',
    },
    {
        id: 'workbench',
        time: 39,
        label: 'Metadata Explorer',
        title: 'Explore what makes your org work.',
        detail: 'Browse metadata, find components, and inspect their structure.',
        accent: '#90d0fe',
    },
    {
        id: 'editor',
        time: 52,
        label: 'VS Code Editor',
        title: 'Write Salesforce code in your browser.',
        detail: 'Create Lightning Web Components in the integrated VS Code editor.',
        accent: '#90d0fe',
    },
    {
        id: 'agent',
        time: 67,
        label: 'Browser agent',
        title: 'Put your browser agent to work.',
        detail: 'Describe a task and follow each action as the agent completes it.',
        accent: '#90d0fe',
    },
];

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        char =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[char]
    );
}

const paths = {
    overlay: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18M3 8h11"/>',
    soql: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    workbench: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
    editor: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-16-4 20"/>',
    agent: '<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M1 12v5m22-5v5M9 12v3m6-3v3"/><circle cx="12" cy="2" r="1"/>',
};
function symbol(id) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
}
function brand(icon) {
    return `<div class="brand"><img src="${icon}" alt=""><strong>Workbench 2.0<span>.</span></strong></div>`;
}
function toolIcons() {
    return `<div class="tool-icons">${SCREENSHOTS.map(s => `<span style="--accent:${s.accent}">${symbol(s.id)}</span>`).join('')}</div>`;
}
function documentHtml(body, css) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Workbench 2.0 · Chrome Web Store</title><style>${css}</style></head><body>${body}</body></html>`;
}

export function screenshotHtml(scene, index, ui, icon, css) {
    return documentHtml(
        `<main class="art screenshot" style="--accent:${scene.accent}">
        <header class="screenshot-header">
            ${brand(icon)}
            <div class="scene-label"><span>0${index + 1} / 05</span>${escapeHtml(scene.label)}</div>
            <h1>${escapeHtml(scene.title)}</h1>
            <p>${escapeHtml(scene.detail)}</p>
            <span class="sample-label">A few of the possibilities · Sample org data</span>
        </header>
        <img class="screen-image" src="${ui}" alt="${escapeHtml(scene.label)}">
    </main>`,
        css
    );
}

export function promoHtml(kind, images, icon, css) {
    if (kind === 'small') {
        return documentHtml(
            `<main class="art promo-small">
            ${brand(icon)}
            <h1>Less switching.<br><span>More building.</span></h1>
            <p>Your Salesforce toolkit.</p>
            ${toolIcons()}
        </main>`,
            css
        );
    }
    return documentHtml(
        `<main class="art promo-marquee">
        <div class="marquee-copy">
            ${brand(icon)}
            <h1>Less switching.<br><span>More building.</span></h1>
            <p>Your Salesforce toolkit.<br>Just a few of its possibilities.</p>
            ${toolIcons()}
        </div>
        <div class="marquee-art">
            <span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
            <img class="marquee-editor" src="${images.editor}" alt="VS Code Editor">
            <img class="marquee-soql" src="${images.soql}" alt="SOQL Explorer">
            <div class="marquee-caption">DATA <i></i> METADATA <i></i> CODE <i></i> AI</div>
        </div>
    </main>`,
        css
    );
}

export function reviewHtml(assets, css) {
    return documentHtml(
        `<main class="review"><h1>Workbench 2.0 · Chrome Web Store assets</h1>
        <p>Upload the PNG files in the numbered screenshot order. This sheet is for review.</p>
        <div class="review-grid">${assets.map(asset => `<figure><div><img src="${asset.data}" alt="${escapeHtml(asset.name)}"></div><figcaption>${escapeHtml(asset.name)}<span>${asset.width} × ${asset.height}</span></figcaption></figure>`).join('')}</div>
    </main>`,
        css
    );
}
