import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduxSlice, executeApexAnonymous } from '../apex.ts';

const reduce = reduxSlice.reducer;

test('clearing an Apex error updates the nested execution entity', () => {
    let state = reduce(undefined, {
        type: executeApexAnonymous.rejected.type,
        meta: { arg: { tabId: 'TAB-1', body: 'bad code' } },
        error: { message: 'Compilation failed' },
    });
    assert.equal(state.apex.entities['tab-1'].error.message, 'Compilation failed');
    state = reduce(state, reduxSlice.actions.clearApexError({ tabId: 'TAB-1' }));
    assert.equal(state.apex.entities['tab-1'].error, null);
    assert.deepEqual(state.apex.ids, ['tab-1']);
    assert.equal(state.entities, undefined);
});

test('Apex restores loaded cached tabs once and resolves saved-file content', () => {
    const apexFiles = {
        ids: ['saved'],
        entities: {
            saved: { id: 'saved', content: 'System.debug(1);' },
        },
    };
    const cachedConfig = {
        recentPanelToggled: true,
        tabs: [
            { id: 'restored', name: 'Restored script', fileId: 'saved', body: 'System.debug(2);' },
        ],
    };
    let state = reduce(
        undefined,
        reduxSlice.actions.loadCacheSettings({ apexFiles, cachedConfig })
    );
    assert.equal(state.tabs[0].id, 'restored');
    assert.equal(state.tabs[0].fileBody, 'System.debug(1);');
    assert.equal(state.tabs[0].isDraft, true);
    assert.equal(state.recentPanelToggled, true);
    const count = state.tabs.length;
    state = reduce(state, reduxSlice.actions.loadCacheSettings({ apexFiles, cachedConfig }));
    assert.equal(state.tabs.length, count);
});
