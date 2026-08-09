/**
 * Direct-import tests for the standalone `loadCacheSettings(alias)` function
 * exported from `../api.ts` (NOT the same-named reducer inside `apiSlice`,
 * see `api.test.ts` for that one — the two share a name but live in
 * different scopes: this one is a top-level `export async function`, the
 * other is a property inside `apiSlice.reducers`).
 *
 * Why this one CAN be imported directly (unlike the rest of `../api.ts`)
 * -----------------------------------------------------------------------
 * `../api.ts` imports `DOCUMENT`/`ERROR` from `host-api/store` at module
 * top-level, and `host-api/store` transitively loads LWC `@api`/`@wire`
 * decorator syntax the plain `--experimental-strip-types` runner can't
 * parse — so importing `../api.ts` itself always throws
 * `SyntaxError: Invalid or unexpected token` (verified empirically; see the
 * header comment in `api.test.ts` for the full explanation and the
 * faithful-clone approach used there).
 *
 * However `loadCacheSettings` itself only depends on `shared/cacheManager`
 * (`loadExtensionConfigFromCache`, `CACHE_CONFIG`) and `shared/utils`
 * (`safeParseJson`), neither of which import `host-api/store`. Since the
 * *module* fails to parse as a whole (not just this function), we can't
 * `import { loadCacheSettings } from '../api.ts'` either — Node still has
 * to parse the whole file before it can pick out one export. So this file
 * re-implements `loadCacheSettings` verbatim (it's tiny — 8 lines) and
 * exercises the REAL `shared/cacheManager` + `shared/utils` dependencies
 * (no mocking of those), only stubbing `window.localStorage` (the actual
 * browser API cacheManager bottoms out on) the same way
 * `core/announcements/__tests__/announcements.test.ts` does.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import {
    loadExtensionConfigFromCache,
    saveExtensionConfigToCache,
    CACHE_CONFIG,
} from 'shared/cacheManager';
import { safeParseJson } from 'shared/utils';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../api.ts'), 'utf8');

function createLocalStorageMock(): Storage {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => store.clear(),
        get length() {
            return store.size;
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
    } as unknown as Storage;
}

// Faithful clone of `../api.ts`'s exported `loadCacheSettings`. MUST stay in
// sync — the source-contract tests at the bottom pin the real file.
const API_SETTINGS_KEY = 'API_SETTINGS_KEY';

async function loadCacheSettings(alias: string) {
    const key = `${alias}-${API_SETTINGS_KEY}`;
    const arr = [key, CACHE_CONFIG.API_SPLITTER_IS_HORIZONTAL.key];
    const configMap = await loadExtensionConfigFromCache(arr);
    if (configMap && configMap.hasOwnProperty(key)) {
        configMap[key] = safeParseJson(configMap[key] as string) || null;
    }
    return configMap;
}

test('loadCacheSettings: returns defaults (including API_SPLITTER_IS_HORIZONTAL) when nothing is cached', async () => {
    globalThis.window = { localStorage: createLocalStorageMock() } as unknown as Window &
        typeof globalThis;

    const result = await loadCacheSettings('myorg');

    assert.equal(result['myorg-API_SETTINGS_KEY'], null, 'uncached alias key defaults to null');
    assert.equal(
        result[CACHE_CONFIG.API_SPLITTER_IS_HORIZONTAL.key],
        true,
        'CACHE_CONFIG default value must be surfaced for a registered key'
    );
});

test('loadCacheSettings: parses a previously cached settings blob for the given alias', async () => {
    globalThis.window = { localStorage: createLocalStorageMock() } as unknown as Window &
        typeof globalThis;

    const key = 'myorg-API_SETTINGS_KEY';
    const savedPayload = { viewerTab: 'Pretty', requestTab: 'Body', tabs: [] };
    // Mirrors real call sites: the slice's local `saveCacheSettings` writes a
    // JSON *string* as the cache value (see `api.test.ts` for that reducer),
    // and cacheManager's storage layer independently JSON-encodes whatever
    // value it's given — so the round trip through the real cache stack
    // double-encodes/decodes exactly once each way.
    await saveExtensionConfigToCache({ [key]: JSON.stringify(savedPayload) });

    const result = await loadCacheSettings('myorg');

    assert.deepEqual(result[key], savedPayload);
});

test('loadCacheSettings: different alias -> different, independent cache key', async () => {
    globalThis.window = { localStorage: createLocalStorageMock() } as unknown as Window &
        typeof globalThis;

    await saveExtensionConfigToCache({ 'org-a-API_SETTINGS_KEY': JSON.stringify({ a: 1 }) });

    const resultA = await loadCacheSettings('org-a');
    const resultB = await loadCacheSettings('org-b');

    assert.deepEqual(resultA['org-a-API_SETTINGS_KEY'], { a: 1 });
    assert.equal(resultB['org-b-API_SETTINGS_KEY'], null, 'org-b has no cached value of its own');
});

test('loadCacheSettings: malformed cached JSON degrades to null (safeParseJson swallows the error)', async () => {
    globalThis.window = { localStorage: createLocalStorageMock() } as unknown as Window &
        typeof globalThis;

    const key = 'broken-API_SETTINGS_KEY';
    // Write a value that, once round-tripped through cacheManager's storage
    // decode, is a string that is NOT valid JSON (so the second, explicit
    // `safeParseJson` call inside `loadCacheSettings` fails and falls back).
    await saveExtensionConfigToCache({ [key]: 'not-json-{{{' });

    const result = await loadCacheSettings('broken');

    assert.equal(result[key], null);
});

// ---------------------------------------------------------------------------
// Source contract — pin the real `../api.ts` against regexes so drift
// between this clone and the real implementation is caught in review.
// ---------------------------------------------------------------------------

test('source contract: loadCacheSettings builds the cache key as `${alias}-${API_SETTINGS_KEY}`', () => {
    assert.match(SRC, /const API_SETTINGS_KEY = 'API_SETTINGS_KEY';/);
    assert.match(
        SRC,
        /export async function loadCacheSettings\(alias\) \{\s*const key = `\$\{alias\}-\$\{API_SETTINGS_KEY\}`;/
    );
});

test('source contract: loadCacheSettings queries CACHE_CONFIG.API_SPLITTER_IS_HORIZONTAL alongside the alias key', () => {
    assert.match(SRC, /const arr = \[key, CACHE_CONFIG\.API_SPLITTER_IS_HORIZONTAL\.key\];/);
});

test('source contract: loadCacheSettings re-parses the alias value via hasOwnProperty + safeParseJson', () => {
    assert.match(
        SRC,
        /if \(configMap && configMap\.hasOwnProperty\(key\)\) \{\s*configMap\[key\] = safeParseJson\(configMap\[key\]\) \|\| null;\s*\}/
    );
});
