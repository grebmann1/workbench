const assert = require('node:assert/strict');
const test = require('node:test');

const {
    validate,
    flattenedEntryFromManifest,
    identForName,
    settingsComponentIdent,
    renderGeneratedRegistryFlattened,
} = require('../generate_application_manifest.js');

function validManifest(overrides = {}) {
    return {
        id: 'soql',
        name: 'soql/app',
        label: 'SOQL',
        shortName: 'SOQL',
        description: 'Run SOQL queries',
        path: 'soql',
        quickActionIcon: 'standard:query',
        type: 'developer',
        menuGroup: 'data',
        menuOrder: 1,
        flags: {
            isFullHeight: true,
            isDeletable: false,
            isElectronOnly: false,
            isOfflineAvailable: false,
            isMenuVisible: true,
            isTabVisible: true,
        },
        ...overrides,
    };
}

// filePath is only used for error messages + the folder-name-vs-id rule, so
// an imaginary path under the manifest's id is sufficient when the id matches.
function fakePath(id) {
    return `/tmp/notreal/${id}/${id}.manifest.json`;
}

test('validate: accepts a well-formed manifest', () => {
    const m = validManifest();
    assert.doesNotThrow(() => validate(m, fakePath(m.id)));
});

test('validate: rejects missing required fields', () => {
    const m = validManifest();
    delete m.shortName;
    assert.throws(() => validate(m, fakePath(m.id)), /missing required field "shortName"/);
});

test('validate: rejects unknown top-level field', () => {
    const m = validManifest({ extraneous: 'nope' });
    assert.throws(() => validate(m, fakePath(m.id)), /unknown field "extraneous"/);
});

test('validate: rejects non-boolean flag', () => {
    const m = validManifest();
    m.flags.isFullHeight = 'yes';
    assert.throws(() => validate(m, fakePath(m.id)), /flags\.isFullHeight must be boolean/);
});

test('validate: rejects unknown flag', () => {
    const m = validManifest();
    m.flags.isSecretAdmin = true;
    assert.throws(() => validate(m, fakePath(m.id)), /unknown flag "flags\.isSecretAdmin"/);
});

test('validate: rejects non-integer menuOrder', () => {
    const m = validManifest({ menuOrder: 1.5 });
    assert.throws(() => validate(m, fakePath(m.id)), /menuOrder must be a non-negative integer/);
});

test('validate: rejects negative menuOrder', () => {
    const m = validManifest({ menuOrder: -1 });
    assert.throws(() => validate(m, fakePath(m.id)), /menuOrder must be a non-negative integer/);
});

test('validate: rejects id with uppercase start', () => {
    const m = validManifest({ id: 'Soql' });
    // id-folder mismatch will fire before the pattern check given fakePath.
    assert.throws(() => validate(m, fakePath('Soql')), /id "Soql" must match/);
});

test('validate: rejects name not ending in /app', () => {
    const m = validManifest({ name: 'soql/main' });
    assert.throws(() => validate(m, fakePath(m.id)), /name "soql\/main" must match/);
});

test('validate: rejects path with uppercase', () => {
    const m = validManifest({ path: 'SoQl' });
    assert.throws(() => validate(m, fakePath(m.id)), /path "SoQl" must match/);
});

test('validate: rejects unknown type', () => {
    const m = validManifest({ type: 'unknown' });
    assert.throws(() => validate(m, fakePath(m.id)), /type "unknown" must be one of/);
});

test('validate: rejects unknown menuGroup', () => {
    const m = validManifest({ menuGroup: 'misc' });
    assert.throws(() => validate(m, fakePath(m.id)), /menuGroup "misc" must be one of/);
});

test('validate: rejects icon without namespace', () => {
    const m = validManifest({ quickActionIcon: 'query' });
    assert.throws(() => validate(m, fakePath(m.id)), /quickActionIcon "query" must match/);
});

test('validate: rejects id that does not equal parent folder name', () => {
    const m = validManifest({ id: 'soql' });
    assert.throws(() => validate(m, fakePath('metadata')), /must equal parent folder name "metadata"/);
});

test('validate: accepts optional menuIcon when well-formed', () => {
    const m = validManifest({ menuIcon: 'utility:open' });
    assert.doesNotThrow(() => validate(m, fakePath(m.id)));
});

test('validate: rejects malformed menuIcon', () => {
    const m = validManifest({ menuIcon: 'notanicon' });
    assert.throws(() => validate(m, fakePath(m.id)), /menuIcon "notanicon" must match/);
});

test('flattenedEntryFromManifest: flattens flags + strips id/name/flags/reducerKey/settingsComponent', () => {
    const m = validManifest({ reducerKey: 'soqlSlice', settingsComponent: 'soql/appSettings' });
    const entry = flattenedEntryFromManifest(m);
    assert.equal(entry.isFullHeight, true);
    assert.equal(entry.isOfflineAvailable, false);
    assert.equal(entry.label, 'SOQL');
    assert.ok(!('id' in entry));
    assert.ok(!('name' in entry));
    assert.ok(!('flags' in entry));
    assert.ok(!('reducerKey' in entry));
    assert.ok(!('settingsComponent' in entry));
});

test('identForName: module name becomes a valid JS identifier', () => {
    assert.equal(identForName('soql/app'), 'soql_app_module');
    assert.equal(identForName('accessAnalyzer/app'), 'accessAnalyzer_app_module');
});

test('settingsComponentIdent: module name becomes a valid settings identifier', () => {
    assert.equal(settingsComponentIdent('soql/appSettings'), 'soql_appSettings_settings');
});

test('renderGeneratedRegistryFlattened: emits imports + mapping for one app', () => {
    const manifests = [validManifest()];
    const out = renderGeneratedRegistryFlattened(manifests);
    assert.match(out, /^\/\/ Auto-generated/);
    assert.match(out, /import soql_app_module from 'soql\/app';/);
    assert.match(out, /'soql\/app': \{/);
    assert.match(out, /module: soql_app_module,/);
    assert.match(out, /isFullHeight: true,/);
    assert.match(out, /path: 'soql',/);
    assert.match(out, /export \{ APPLICATION_APP_MAPPING \};/);
});

test('renderGeneratedRegistryFlattened: sorts multiple apps by name', () => {
    const manifests = [
        validManifest({ id: 'zetaApp', name: 'zetaApp/app', path: 'zetaapp' }),
        validManifest({ id: 'alpha', name: 'alpha/app', path: 'alpha' }),
    ];
    const out = renderGeneratedRegistryFlattened(manifests);
    const alphaIdx = out.indexOf("'alpha/app':");
    const zetaIdx = out.indexOf("'zetaApp/app':");
    assert.ok(alphaIdx > 0);
    assert.ok(zetaIdx > alphaIdx);
});

test('renderGeneratedRegistryFlattened: emits settingsComponent import and key when present', () => {
    const manifests = [
        validManifest({ id: 'soql', name: 'soql/app', settingsComponent: 'soql/appSettings' }),
    ];
    const out = renderGeneratedRegistryFlattened(manifests);
    assert.match(out, /import soql_appSettings_settings from 'soql\/appSettings';/);
    assert.match(out, /settingsComponent: soql_appSettings_settings,/);
    assert.match(out, /settingsComponentName: 'soql\/appSettings',/);
});
