import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserSession, listBrowserTabs, validateBrowserUrl } from '../browserRuntime.js';

function fixture() {
    const tab = { id: 17, url: 'https://example.com/form', status: 'complete' };
    const calls = [];
    let next = 0;
    const api = {
        tabs: {
            get: async id => {
                assert.equal(id, 17);
                return tab;
            },
            update: async (id, update) => calls.push({ id, update }),
            goBack: async id => calls.push({ back: id }),
        },
        scripting: {
            executeScript: async injection => {
                calls.push(injection);
                return [
                    { documentId: 'doc-1', result: { snapshotId: `s-${++next}`, url: tab.url } },
                ];
            },
        },
    };
    return { tab, calls, api, session: createBrowserSession(17, api) };
}

test('browser URL policy rejects privileged schemes, credential URLs and protected Chrome pages', () => {
    for (const url of [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'chrome://settings',
        'data:text/html,hi',
        'https://user:pass@example.com',
        'https://chromewebstore.google.com/detail/test',
        'not a URL',
    ]) {
        assert.throws(() => validateBrowserUrl(url));
    }
    assert.equal(
        validateBrowserUrl('https://example.com/path?q=1'),
        'https://example.com/path?q=1'
    );
});

test('tab discovery omits unsupported pages and exposes only selected metadata', async () => {
    const tabs = await listBrowserTabs({
        tabs: {
            query: async () => [
                { id: 1, url: 'chrome://settings' },
                {
                    id: 2,
                    url: 'https://example.com',
                    title: 'Example',
                    active: true,
                    secret: 'omit',
                },
            ],
        },
        scripting: { executeScript() {} },
    });
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].id, 2);
    assert.equal('secret' in tabs[0], false);
});

test('writes target the captured tab and exact observed document in the isolated world', async () => {
    const { session, calls } = fixture();
    const snapshot = await session.run('snapshot');
    await session.run('fill', { snapshotId: snapshot.snapshotId, ref: 'field', value: 'Ada' });
    assert.deepEqual(calls[0].target, { tabId: 17, frameIds: [0] });
    assert.deepEqual(calls[1].target, { tabId: 17, documentIds: ['doc-1'] });
    assert.equal(calls[1].world, 'ISOLATED');
    await assert.rejects(
        session.run('click', { snapshotId: snapshot.snapshotId, ref: 'save' }),
        /fresh browser_snapshot/
    );
    assert.equal(calls.length, 2);
});

test('URL changes and loading pages cannot reuse a previously approved snapshot', async () => {
    const { session, calls, tab } = fixture();
    const { snapshotId } = await session.run('snapshot');
    tab.url = 'https://example.com/other';
    await assert.rejects(
        session.run('click', { snapshotId, ref: 'save' }),
        /page or snapshot changed/
    );
    tab.status = 'loading';
    await assert.rejects(session.run('snapshot'), /loading/);
    assert.equal(calls.length, 1);
});

test('failed or uncertain writes consume the snapshot and cannot be replayed', async () => {
    const { session, api } = fixture();
    const { snapshotId } = await session.run('snapshot');
    api.scripting.executeScript = async () => {
        throw new Error('Frame removed');
    };
    await assert.rejects(session.run('click', { snapshotId, ref: 'save' }), /Frame removed/);
    await assert.rejects(
        session.run('click', { snapshotId, ref: 'save' }),
        /fresh browser_snapshot/
    );
});

test('queued operations stop before touching Chrome when canceled', async () => {
    const { session, calls } = fixture();
    await assert.rejects(session.run('snapshot', {}, AbortSignal.abort()));
    assert.equal(calls.length, 0);
    await session.run('snapshot');
    assert.equal(calls.length, 1);
});

test('navigation invalidates references and requires observing the loaded page', async () => {
    const { session, calls } = fixture();
    const { snapshotId } = await session.run('snapshot');
    const result = await session.run('navigate', {
        direction: 'url',
        url: 'https://example.com/next',
    });
    assert.deepEqual(calls[1], { id: 17, update: { url: 'https://example.com/next' } });
    assert.match(result.status, /Navigation requested/);
    await assert.rejects(
        session.run('click', { snapshotId, ref: 'save' }),
        /fresh browser_snapshot/
    );
    await assert.rejects(session.run('navigate', { direction: 'url', url: 'javascript:alert(1)' }));
});
