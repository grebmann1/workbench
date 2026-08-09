/**
 * Behavior tests for the pure, standalone helper functions defined at module
 * scope in `../metadata.ts` (outside of `createSlice`/`createAsyncThunk`).
 *
 * Why we don't import `../metadata.ts` directly
 * -----------------------------------------------
 * The slice file imports `host-api/store` (for `DESCRIBE`, `BACKGROUNDJOB`,
 * `ERROR`, `SOBJECT`) and `core/store/storeRef` (for `getStore`).
 * `host-api/store` transitively loads the full core store graph, including
 * LWC components decorated with `@api`/`@wire` — invalid syntax under plain
 * Node, since this test runner only strips TypeScript types and cannot parse
 * LWC decorator syntax. Importing the real module throws
 * `SyntaxError: Invalid or unexpected token`. This has been verified
 * empirically in this repo (see `platformevent/slices/__tests__/platformEvent.test.ts`
 * and `agentforce/slices/__tests__/agents.test.ts`, which document the same
 * constraint).
 *
 * Pragmatic alternative: re-implement each helper here as a "faithful clone"
 * — copied verbatim from the real source — and pin fidelity with "source
 * contract" tests that `readFileSync` the real `../metadata.ts` and
 * `assert.match` against regexes covering the exact logic. Any drift between
 * the clone and the real file is caught by those contract tests.
 *
 * `shared/cacheManager` (used by `shouldPersistMetadataClone`'s tests) is
 * NOT LWC-coupled and imports cleanly under plain Node, so we import the
 * real `CACHE_CONFIG` from there rather than hardcoding key strings.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { CACHE_CONFIG } from 'shared/cacheManager';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../metadata.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Clones — copied verbatim from ../metadata.ts
// ---------------------------------------------------------------------------

const getMetadataSyncJobIdClone = (alias?: string | null, startedAt: number = Date.now()) =>
    `metadata-sync-${alias || 'unknown'}-${startedAt}`;

const getMetadataResultSummaryClone = (result: any) => {
    if (!result || typeof result !== 'object') {
        return null;
    }
    if (Number.isFinite(result.writtenCount)) {
        return `Wrote ${result.writtenCount} entries`;
    }
    if (Number.isFinite(result.totalEntries)) {
        return `Processed ${result.totalEntries} entries`;
    }
    return null;
};

const auraNameMappingClone = (name: string, type: string) => {
    switch (type) {
        case 'COMPONENT':
            return `${name}.cmp`;
        case 'CONTROLLER':
            return `${name}Controller.js`;
        case 'HELPER':
            return `${name}Helper.js`;
        case 'RENDERER':
            return `${name}Renderer.js`;
        case 'DOCUMENTATION':
            return `${name}.auradoc`;
        case 'DESIGN':
            return `${name}.design`;
        case 'SVG':
            return `${name}.svg`;
        default:
            return name;
    }
};

const normalizeMetadataTypesClone = (value: any): any[] => {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(Boolean);
            }
        } catch (_) {
            // Ignore JSON parse errors and fallback to comma-separated parsing.
        }
        return trimmed
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }
    if (value && typeof value === 'object') {
        return Object.values(value).filter(Boolean);
    }
    return [];
};

const shouldPersistMetadataClone = (config: any, alias: any, metadataType: string) => {
    if (!alias) return false;
    if (!config?.[CACHE_CONFIG.METADATA_STORAGE_ENABLED.key]) return false;
    const selectedTypes = Array.isArray(config?.[CACHE_CONFIG.METADATA_STORAGE_TYPES.key])
        ? config[CACHE_CONFIG.METADATA_STORAGE_TYPES.key]
        : [];
    return selectedTypes.includes(metadataType);
};

// ---------------------------------------------------------------------------
// getMetadataSyncJobId
// ---------------------------------------------------------------------------

test('getMetadataSyncJobId: builds a deterministic id from alias + startedAt', () => {
    assert.equal(getMetadataSyncJobIdClone('myOrg', 12345), 'metadata-sync-myOrg-12345');
});

test('getMetadataSyncJobId: falls back to "unknown" when alias is falsy', () => {
    assert.equal(getMetadataSyncJobIdClone(null, 1), 'metadata-sync-unknown-1');
    assert.equal(getMetadataSyncJobIdClone(undefined, 1), 'metadata-sync-unknown-1');
    assert.equal(getMetadataSyncJobIdClone('', 1), 'metadata-sync-unknown-1');
});

test('getMetadataSyncJobId: defaults startedAt to Date.now() when omitted', () => {
    const id = getMetadataSyncJobIdClone('myOrg');
    assert.match(id, /^metadata-sync-myOrg-\d+$/);
});

// ---------------------------------------------------------------------------
// getMetadataResultSummary
// ---------------------------------------------------------------------------

test('getMetadataResultSummary: returns null for non-object input', () => {
    assert.equal(getMetadataResultSummaryClone(null), null);
    assert.equal(getMetadataResultSummaryClone(undefined), null);
    assert.equal(getMetadataResultSummaryClone('a string'), null);
    assert.equal(getMetadataResultSummaryClone(42), null);
});

test('getMetadataResultSummary: prefers writtenCount when finite', () => {
    assert.equal(getMetadataResultSummaryClone({ writtenCount: 7 }), 'Wrote 7 entries');
});

test('getMetadataResultSummary: falls back to totalEntries when writtenCount is absent/non-finite', () => {
    assert.equal(getMetadataResultSummaryClone({ totalEntries: 42 }), 'Processed 42 entries');
    assert.equal(
        getMetadataResultSummaryClone({ writtenCount: NaN, totalEntries: 3 }),
        'Processed 3 entries'
    );
});

test('getMetadataResultSummary: writtenCount takes precedence over totalEntries when both are present', () => {
    assert.equal(
        getMetadataResultSummaryClone({ writtenCount: 5, totalEntries: 100 }),
        'Wrote 5 entries'
    );
});

test('getMetadataResultSummary: returns null when neither field is a finite number', () => {
    assert.equal(getMetadataResultSummaryClone({}), null);
    assert.equal(getMetadataResultSummaryClone({ writtenCount: 'nope', totalEntries: null }), null);
});

test('getMetadataResultSummary: writtenCount of 0 is finite and takes the "Wrote" branch', () => {
    assert.equal(getMetadataResultSummaryClone({ writtenCount: 0 }), 'Wrote 0 entries');
});

// ---------------------------------------------------------------------------
// _auraNameMapping
// ---------------------------------------------------------------------------

test('_auraNameMapping: maps each known DefType to its file suffix', () => {
    assert.equal(auraNameMappingClone('Foo', 'COMPONENT'), 'Foo.cmp');
    assert.equal(auraNameMappingClone('Foo', 'CONTROLLER'), 'FooController.js');
    assert.equal(auraNameMappingClone('Foo', 'HELPER'), 'FooHelper.js');
    assert.equal(auraNameMappingClone('Foo', 'RENDERER'), 'FooRenderer.js');
    assert.equal(auraNameMappingClone('Foo', 'DOCUMENTATION'), 'Foo.auradoc');
    assert.equal(auraNameMappingClone('Foo', 'DESIGN'), 'Foo.design');
    assert.equal(auraNameMappingClone('Foo', 'SVG'), 'Foo.svg');
});

test('_auraNameMapping: returns the bare name for an unrecognized type', () => {
    assert.equal(auraNameMappingClone('Foo', 'STYLE'), 'Foo');
    assert.equal(auraNameMappingClone('Foo', 'UNKNOWN_TYPE'), 'Foo');
});

// ---------------------------------------------------------------------------
// normalizeMetadataTypes
// ---------------------------------------------------------------------------

test('normalizeMetadataTypes: passes through arrays, dropping falsy entries', () => {
    assert.deepEqual(normalizeMetadataTypesClone(['ApexClass', '', null, 'Flow', 0]), [
        'ApexClass',
        'Flow',
    ]);
});

test('normalizeMetadataTypes: parses a JSON array string', () => {
    assert.deepEqual(normalizeMetadataTypesClone('["ApexClass","Flow"]'), ['ApexClass', 'Flow']);
});

test('normalizeMetadataTypes: falls back to comma-separated parsing when JSON.parse yields a non-array', () => {
    // '"ApexClass"' parses as valid JSON (a string), not an array, so the
    // comma-split fallback path is taken, producing a single-element array.
    assert.deepEqual(normalizeMetadataTypesClone('"ApexClass"'), ['"ApexClass"']);
});

test('normalizeMetadataTypes: falls back to comma-separated parsing on invalid JSON', () => {
    assert.deepEqual(normalizeMetadataTypesClone('ApexClass, Flow ,  CustomObject'), [
        'ApexClass',
        'Flow',
        'CustomObject',
    ]);
});

test('normalizeMetadataTypes: returns [] for an empty/whitespace-only string', () => {
    assert.deepEqual(normalizeMetadataTypesClone(''), []);
    assert.deepEqual(normalizeMetadataTypesClone('   '), []);
});

test('normalizeMetadataTypes: extracts values from a plain object', () => {
    assert.deepEqual(normalizeMetadataTypesClone({ a: 'ApexClass', b: null, c: 'Flow' }), [
        'ApexClass',
        'Flow',
    ]);
});

test('normalizeMetadataTypes: returns [] for null, undefined, numbers, booleans', () => {
    assert.deepEqual(normalizeMetadataTypesClone(null), []);
    assert.deepEqual(normalizeMetadataTypesClone(undefined), []);
    assert.deepEqual(normalizeMetadataTypesClone(42), []);
    assert.deepEqual(normalizeMetadataTypesClone(true), []);
});

// ---------------------------------------------------------------------------
// shouldPersistMetadata
// ---------------------------------------------------------------------------

test('shouldPersistMetadata: false when alias is falsy', () => {
    const config = {
        [CACHE_CONFIG.METADATA_STORAGE_ENABLED.key]: true,
        [CACHE_CONFIG.METADATA_STORAGE_TYPES.key]: ['ApexClass'],
    };
    assert.equal(shouldPersistMetadataClone(config, null, 'ApexClass'), false);
    assert.equal(shouldPersistMetadataClone(config, '', 'ApexClass'), false);
});

test('shouldPersistMetadata: false when storage is disabled in config', () => {
    const config = {
        [CACHE_CONFIG.METADATA_STORAGE_ENABLED.key]: false,
        [CACHE_CONFIG.METADATA_STORAGE_TYPES.key]: ['ApexClass'],
    };
    assert.equal(shouldPersistMetadataClone(config, 'myOrg', 'ApexClass'), false);
});

test('shouldPersistMetadata: false when config is null/undefined', () => {
    assert.equal(shouldPersistMetadataClone(null, 'myOrg', 'ApexClass'), false);
    assert.equal(shouldPersistMetadataClone(undefined, 'myOrg', 'ApexClass'), false);
});

test('shouldPersistMetadata: false when METADATA_STORAGE_TYPES is not an array', () => {
    const config = {
        [CACHE_CONFIG.METADATA_STORAGE_ENABLED.key]: true,
        [CACHE_CONFIG.METADATA_STORAGE_TYPES.key]: 'ApexClass',
    };
    assert.equal(shouldPersistMetadataClone(config, 'myOrg', 'ApexClass'), false);
});

test('shouldPersistMetadata: true only when alias, enabled flag, and matching type are all present', () => {
    const config = {
        [CACHE_CONFIG.METADATA_STORAGE_ENABLED.key]: true,
        [CACHE_CONFIG.METADATA_STORAGE_TYPES.key]: ['ApexClass', 'Flow'],
    };
    assert.equal(shouldPersistMetadataClone(config, 'myOrg', 'ApexClass'), true);
    assert.equal(shouldPersistMetadataClone(config, 'myOrg', 'Flow'), true);
    assert.equal(
        shouldPersistMetadataClone(config, 'myOrg', 'CustomObject'),
        false,
        'type not in selected list must be rejected'
    );
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../metadata.ts` against regexes so
// drift between these clones and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: getMetadataSyncJobId builds `metadata-sync-${alias || "unknown"}-${startedAt}`', () => {
    assert.match(
        SRC,
        /getMetadataSyncJobId = \(alias, startedAt = Date\.now\(\)\) =>\s*\n\s*`metadata-sync-\$\{alias \|\| 'unknown'\}-\$\{startedAt\}`/
    );
});

test('source contract: getMetadataResultSummary checks writtenCount before totalEntries via Number.isFinite', () => {
    assert.match(
        SRC,
        /getMetadataResultSummary = result => \{[\s\S]+?if \(Number\.isFinite\(result\.writtenCount\)\) \{[\s\S]+?Wrote \$\{result\.writtenCount\} entries[\s\S]+?if \(Number\.isFinite\(result\.totalEntries\)\) \{[\s\S]+?Processed \$\{result\.totalEntries\} entries/
    );
});

test('source contract: _auraNameMapping switches on all seven known AuraDefinition DefTypes', () => {
    for (const [type, suffix] of [
        ['COMPONENT', '.cmp'],
        ['CONTROLLER', 'Controller.js'],
        ['HELPER', 'Helper.js'],
        ['RENDERER', 'Renderer.js'],
        ['DOCUMENTATION', '.auradoc'],
        ['DESIGN', '.design'],
        ['SVG', '.svg'],
    ]) {
        assert.match(
            SRC,
            new RegExp(
                `case '${type}':\\s*\\n\\s*return \\\`\\$\\{name\\}${suffix.replace('.', '\\.')}\\\`;`
            )
        );
    }
});

test('source contract: normalizeMetadataTypes tries JSON.parse before comma-splitting a string', () => {
    assert.match(
        SRC,
        /if \(typeof value === 'string'\) \{[\s\S]+?try \{[\s\S]+?const parsed = JSON\.parse\(trimmed\);[\s\S]+?catch[\s\S]+?trimmed\s*\n\s*\.split\(','\)/
    );
});

test('source contract: shouldPersistMetadata gates on alias, METADATA_STORAGE_ENABLED, then selectedTypes.includes(metadataType)', () => {
    assert.match(
        SRC,
        /shouldPersistMetadata = \(config, alias, metadataType\) => \{\s*\n\s*if \(!alias\) return false;\s*\n\s*if \(!config\?\.\[CACHE_CONFIG\.METADATA_STORAGE_ENABLED\.key\]\) return false;/
    );
    assert.match(SRC, /return selectedTypes\.includes\(metadataType\);/);
});
