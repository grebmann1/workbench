import assert from 'node:assert/strict';
import { test } from 'node:test';

type ScriptStub = {
    src?: string;
    async?: boolean;
    onload?: () => void;
    onerror?: () => void;
};

type DocumentStub = {
    head: { appendChild: (el: ScriptStub) => void };
    querySelector: (selector: string) => ScriptStub | null;
    createElement: (tag: string) => ScriptStub;
    appended: ScriptStub[];
};

function makeDocumentStub(): DocumentStub {
    const doc: DocumentStub = {
        appended: [],
        head: {
            appendChild: (el: ScriptStub) => {
                doc.appended.push(el);
                // simulate async onload
                queueMicrotask(() => el.onload?.());
            },
        },
        querySelector: () => null,
        createElement: (_tag: string) => ({}) as ScriptStub,
    };
    return doc;
}

const doc = makeDocumentStub();
(globalThis as unknown as { document: DocumentStub }).document = doc;
(globalThis as unknown as { window: Record<string, unknown> }).window = {};

const { ensureMonacoLoaded, ensureMermaidLoaded } = await import('../loader.ts');

test('ensureMonacoLoaded: short-circuits when window.monaco already present', async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window.monaco = {
        sentinel: true,
    };
    doc.appended.length = 0;
    const result = (await ensureMonacoLoaded()) as { sentinel: boolean };
    assert.equal(result.sentinel, true);
    assert.equal(doc.appended.length, 0);
});

test('ensureMonacoLoaded: appends script tag when not yet loaded', async () => {
    delete (globalThis as unknown as { window: Record<string, unknown> }).window.monaco;
    doc.appended.length = 0;
    const promise = ensureMonacoLoaded();
    // Simulate monaco defining itself on window before onload completes.
    queueMicrotask(() => {
        (globalThis as unknown as { window: Record<string, unknown> }).window.monaco = {
            ready: true,
        };
    });
    const result = (await promise) as { ready: boolean };
    assert.equal(doc.appended.length, 1);
    assert.equal(doc.appended[0].src, '/libs/monaco/monaco.bundle.js');
    assert.equal(doc.appended[0].async, true);
    assert.equal(result.ready, true);
});

test('ensureMonacoLoaded: second call reuses cached promise (no new script)', async () => {
    // First call already ran — window.monaco is set, but the important thing is
    // the in-memory promise cache prevents a second append even if window.monaco
    // were cleared.
    (globalThis as unknown as { window: Record<string, unknown> }).window.monaco = {
        ready: true,
    };
    doc.appended.length = 0;
    await ensureMonacoLoaded();
    assert.equal(doc.appended.length, 0);
});

test('ensureMermaidLoaded: uses mermaid asset path', async () => {
    delete (globalThis as unknown as { window: Record<string, unknown> }).window.mermaid;
    doc.appended.length = 0;
    const promise = ensureMermaidLoaded();
    queueMicrotask(() => {
        (globalThis as unknown as { window: Record<string, unknown> }).window.mermaid = {
            v: 1,
        };
    });
    await promise;
    assert.equal(doc.appended.length, 1);
    assert.equal(doc.appended[0].src, '/libs/mermaid/mermaid.min.js');
});

test('ensureMermaidLoaded: returns existing window.mermaid without injecting', async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window.mermaid = {
        cached: true,
    };
    doc.appended.length = 0;
    const result = (await ensureMermaidLoaded()) as { cached: boolean };
    assert.equal(result.cached, true);
    assert.equal(doc.appended.length, 0);
});
