/**
 * Unit tests for the small pure/near-pure helper functions near the top of
 * `../apex.ts` (`formatTab`, `enrichTab`, `enrichTabs`, `createInitialTabs`).
 *
 * Why we don't import `../apex.ts` directly
 * -------------------------------------------
 * `../apex.ts` imports `DOCUMENT` from `host-api/store` at module top-level.
 * `host-api/store` transitively loads the full core store graph, including
 * LWC components decorated with `@api`/`@wire` — invalid syntax under plain
 * Node (this repo's test runner can only strip TypeScript types via
 * `--experimental-strip-types`, it cannot parse LWC decorator syntax). Any
 * module that imports `host-api/store`, even transitively, throws
 * `SyntaxError: Invalid or unexpected token` when imported directly in a
 * `node:test` file.
 *
 * Pragmatic alternative (same pattern as
 * `packages/lwc/applications/agentforce/slices/__tests__/agents.test.ts`):
 * faithfully re-implement the tiny helper functions here and pin their
 * exact source via "source contract" regex assertions against the real
 * `../apex.ts`. Any drift between this clone and the real file will fail
 * the source-contract tests below and get caught in review.
 *
 * `guid`, `isNotUndefinedOrNull`, and `lowerCaseKey` are imported directly
 * from `shared/utils` — that module does NOT import `host-api/store`, so it
 * is safe to import in this plain-Node test environment.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { guid, isNotUndefinedOrNull, lowerCaseKey } from 'shared/utils';

const here = path.dirname(fileURLToPath(import.meta.url));
const apexSource = readFileSync(path.resolve(here, '../apex.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clones of the helper functions defined near the top of
// `../apex.ts`. MUST stay in sync with the real file — the source-contract
// tests below catch drift.
// ---------------------------------------------------------------------------

function formatTab({ id, name, body, isDraft, fileId, fileBody }) {
    return { id, name, body, isDraft, fileId, fileBody };
}

function enrichTab(tab, state, selector?) {
    const file =
        tab.fileId && selector ? selector.selectById(state, lowerCaseKey(tab.fileId)) : null;
    const fileBody = file?.content || tab.fileBody;
    return {
        ...tab,
        fileBody: fileBody,
        isDraft: fileBody != tab.body && isNotUndefinedOrNull(tab.fileId),
    };
}

function enrichTabs(tabs, state, selector?) {
    return tabs.map(tab => enrichTab(tab, state, selector));
}

function createInitialTabs() {
    return [enrichTab({ id: guid(), body: 'System.debug(System.now());' }, null)];
}

// ---------------------------------------------------------------------------
// formatTab
// ---------------------------------------------------------------------------

test('formatTab: repacks the known fields and drops extras', () => {
    const input = {
        id: 't1',
        name: 'Tab 1',
        body: 'System.debug(1);',
        isDraft: true,
        fileId: '01p000000000001',
        fileBody: 'saved content',
        // Extra keys that should be dropped.
        extraneous: 'should not appear',
        createdDate: '2026-01-01',
    };

    const result = formatTab(input);

    assert.deepEqual(result, {
        id: 't1',
        name: 'Tab 1',
        body: 'System.debug(1);',
        isDraft: true,
        fileId: '01p000000000001',
        fileBody: 'saved content',
    });
    assert.equal(
        Object.prototype.hasOwnProperty.call(result, 'extraneous'),
        false,
        'extra keys not in the destructure list must be dropped'
    );
    assert.equal(Object.keys(result).length, 6, 'only the six known fields should be present');
});

// ---------------------------------------------------------------------------
// enrichTab
// ---------------------------------------------------------------------------

test('enrichTab: no fileId -> passes through tab.fileBody, isDraft is always false', () => {
    const tab = { id: 't1', body: 'System.debug(1);', fileBody: 'unrelated body' };

    const result = enrichTab(tab, null, null);

    assert.equal(result.fileBody, 'unrelated body', 'fileBody falls through to tab.fileBody');
    assert.equal(
        result.isDraft,
        false,
        'isDraft must be false when fileId is absent, regardless of body/fileBody mismatch'
    );
});

test('enrichTab: no selector (even with fileId) -> file lookup skipped, fileBody passes through', () => {
    const tab = {
        id: 't1',
        body: 'System.debug(1);',
        fileId: '01p000000000001',
        fileBody: 'unrelated body',
    };

    const result = enrichTab(tab, {}, null);

    assert.equal(result.fileBody, 'unrelated body');
    // fileBody ('unrelated body') != body ('System.debug(1);') AND fileId is
    // present -> isDraft is true even though the selector was never
    // consulted (the file lookup is short-circuited, not the isDraft calc).
    assert.equal(result.isDraft, true);
});

test('enrichTab: fileId + selector resolving a file -> fileBody comes from file.content', () => {
    const tab = {
        id: 't1',
        body: 'System.debug(1);',
        fileId: '01p000000000001',
        fileBody: 'stale local body',
    };
    const file = { content: 'System.debug(2);' };
    const state = {};
    const selector = {
        selectById: (s, id) => {
            assert.equal(s, state);
            assert.equal(id, lowerCaseKey(tab.fileId));
            return file;
        },
    };

    const result = enrichTab(tab, state, selector);

    assert.equal(result.fileBody, file.content, 'fileBody must come from file.content');
    assert.equal(
        result.isDraft,
        true,
        'isDraft is true when fileBody (from file.content) differs from tab.body and fileId is present'
    );
});

test('enrichTab: fileId + selector resolving a file whose content matches body -> isDraft false', () => {
    const tab = {
        id: 't1',
        body: 'System.debug(1);',
        fileId: '01p000000000001',
        fileBody: 'stale local body',
    };
    const file = { content: 'System.debug(1);' };
    const selector = { selectById: () => file };

    const result = enrichTab(tab, {}, selector);

    assert.equal(result.fileBody, file.content);
    assert.equal(result.isDraft, false, 'fileBody matches tab.body -> not a draft');
});

test('enrichTab: fileId + selector returning no file -> falls back to tab.fileBody', () => {
    const tab = {
        id: 't1',
        body: 'System.debug(1);',
        fileId: '01p000000000001',
        fileBody: 'System.debug(1);',
    };
    const selector = { selectById: () => undefined };

    const result = enrichTab(tab, {}, selector);

    assert.equal(
        result.fileBody,
        tab.fileBody,
        'no file found -> fileBody falls back to tab.fileBody'
    );
    assert.equal(result.isDraft, false, 'fileBody equals body -> not a draft');
});

test('enrichTab: preserves other tab fields via spread', () => {
    const tab = { id: 't1', name: 'My Tab', body: 'x', fileId: null, fileBody: 'x' };
    const result = enrichTab(tab, null, null);
    assert.equal(result.id, 't1');
    assert.equal(result.name, 'My Tab');
});

// ---------------------------------------------------------------------------
// enrichTabs
// ---------------------------------------------------------------------------

test('enrichTabs: maps enrichTab over each tab in the array', () => {
    const tabs = [
        { id: 't1', body: 'a', fileId: '01p1', fileBody: 'a' },
        { id: 't2', body: 'b', fileId: '01p2', fileBody: 'b' },
        { id: 't3', body: 'c', fileBody: 'c' },
    ];
    const files = {
        '01p1': { content: 'a-updated' },
        '01p2': { content: 'b' },
    };
    const selector = {
        selectById: (_state, id) => files[id],
    };

    const results = enrichTabs(tabs, {}, selector);

    assert.equal(results.length, 3);
    assert.equal(results[0].fileBody, 'a-updated');
    assert.equal(results[0].isDraft, true, 'a-updated != a and fileId present');
    assert.equal(results[1].fileBody, 'b');
    assert.equal(results[1].isDraft, false, 'b == b');
    assert.equal(results[2].fileBody, 'c', 'no fileId -> fileBody passes through tab.fileBody');
    assert.equal(results[2].isDraft, false, 'no fileId -> isDraft always false');
});

test('enrichTabs: empty array returns empty array', () => {
    assert.deepEqual(enrichTabs([], {}, null), []);
});

// ---------------------------------------------------------------------------
// createInitialTabs
// ---------------------------------------------------------------------------

test('createInitialTabs: returns a single default tab with a guid id and default body', () => {
    const tabs = createInitialTabs();

    assert.equal(tabs.length, 1);
    const [tab] = tabs;
    assert.equal(typeof tab.id, 'string');
    assert.ok(tab.id.length > 0, 'id must be a non-empty string');
    assert.equal(tab.body, 'System.debug(System.now());');
    // selector is null in createInitialTabs -> file lookup is skipped, so
    // fileBody falls through to the input tab's fileBody, which was never
    // provided (undefined). isDraft is false because fileId is absent.
    assert.equal(tab.fileBody, undefined);
    assert.equal(tab.isDraft, false);
    assert.equal(tab.fileId, undefined);
});

// ---------------------------------------------------------------------------
// Source contract — pin the cloned bodies against the real ../apex.ts so
// drift in the source gets caught here instead of silently diverging.
// ---------------------------------------------------------------------------

test('source contract: formatTab destructures and repacks the six known fields', () => {
    assert.match(
        apexSource,
        /function formatTab\(\{ id, name, body, isDraft, fileId, fileBody \}\) \{\s*return \{ id, name, body, isDraft, fileId, fileBody \};\s*\}/
    );
});

test('source contract: enrichTab looks up file via selector.selectById(state, lowerCaseKey(tab.fileId))', () => {
    assert.match(
        apexSource,
        /function enrichTab\(tab, state, selector\) \{\s*const file =\s*tab\.fileId && selector \? selector\.selectById\(state, lowerCaseKey\(tab\.fileId\)\) : null;/
    );
});

test('source contract: enrichTab computes fileBody and isDraft exactly as cloned', () => {
    assert.match(apexSource, /const fileBody = file\?\.content \|\| tab\.fileBody;/);
    assert.match(
        apexSource,
        /isDraft: fileBody != tab\.body && isNotUndefinedOrNull\(tab\.fileId\),/
    );
});

test('source contract: enrichTabs maps enrichTab over the tabs array', () => {
    assert.match(
        apexSource,
        /function enrichTabs\(tabs, state, selector\) \{\s*return tabs\.map\(tab => enrichTab\(tab, state, selector\)\);\s*\}/
    );
});

test('source contract: createInitialTabs seeds a single tab with the default Apex script', () => {
    assert.match(
        apexSource,
        /createInitialTabs = \(\) => \{\s*return \[enrichTab\(\{ id: guid\(\), body: 'System\.debug\(System\.now\(\)\);' \}, null\)\];\s*\};/
    );
});
