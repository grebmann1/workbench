/**
 * Unit tests for the manifest validator (`generate_application_manifest.js`).
 *
 * Scope: shape checks for `slashCommands[*]` plus the smoke test that a
 * canonically-shaped manifest passes. The generator's IO side (file scan,
 * file writes, prettier) is excluded — covered by `npm run build:shared`
 * smoke runs in the validator-selector skill.
 *
 * NOTE: this file lives outside the `npm run test` glob (which only walks
 * packages/**). Run directly with `node --test tools/scripts/__test__/`.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const { validate } = require('../generate_application_manifest.js');

function baseManifest() {
    return {
        id: 'sample',
        name: 'sample/app',
        label: 'Sample App',
        shortName: 'Sample',
        description: 'Sample.',
        path: 'sample',
        quickActionIcon: 'standard:bot',
        type: 'developer',
        menuGroup: 'data',
        menuOrder: 0,
        flags: {
            isFullHeight: true,
            isDeletable: true,
            isElectronOnly: false,
            isOfflineAvailable: false,
            isMenuVisible: true,
            isTabVisible: true,
        },
    };
}

// validate() expects the manifest path so the parent-folder-name guard can
// run; we feed it a synthetic path matching the manifest's `id`.
const FAKE_PATH = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'packages',
    'lwc',
    'applications',
    'sample',
    'sample.manifest.json'
);

test('validate: canonical manifest with no slash commands passes', () => {
    assert.doesNotThrow(() => validate(baseManifest(), FAKE_PATH));
});

test('validate: canonical manifest with one valid slash command passes', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'sample',
            description: 'Open sample',
            iconName: 'standard:bot',
            commandId: 'sample.open',
        },
    ];
    assert.doesNotThrow(() => validate(m, FAKE_PATH));
});

test('validate: rejects slash command name with spaces', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'bad name',
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'sample.open',
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /slashCommands\[0\].command must match/);
});

test('validate: rejects slash command name longer than 32 chars', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            // 35-char lowercase string; passes the regex but fails the length cap.
            command: 'a'.repeat(35),
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'sample.open',
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /32 chars or fewer/);
});

test('validate: rejects commandId without a namespace dot', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'sample',
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'noDot',
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /must start with "sample\."/);
});

test('validate: rejects commandId from a different app id (cross-namespace leak)', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'sample',
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'other.open',
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /must start with "sample\."/);
});

test('validate: rejects unknown slash command keys', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'sample',
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'sample.open',
            argsHint: '<name>', // not yet a recognized key
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /unknown key "argsHint"/);
});

test('validate: rejects duplicated slash command name within the same manifest', () => {
    const m = baseManifest();
    m.slashCommands = [
        {
            command: 'sample',
            description: 'x',
            iconName: 'standard:bot',
            commandId: 'sample.open',
        },
        {
            command: 'sample',
            description: 'y',
            iconName: 'standard:bot',
            commandId: 'sample.open',
        },
    ];
    assert.throws(() => validate(m, FAKE_PATH), /duplicated in the same manifest/);
});

test('validate: accepts kebab-case slash command names (e.g. af-agent, af-trace)', () => {
    const m = baseManifest();
    m.id = 'agentforce';
    m.name = 'agentforce/app';
    m.path = 'agentforce';
    m.menuGroup = 'agentforce';
    m.slashCommands = [
        {
            command: 'af-agent',
            description: 'Open agent',
            iconName: 'standard:bot',
            commandId: 'agentforce.openAgent',
        },
        {
            command: 'af-trace',
            description: 'Open trace',
            iconName: 'standard:bot',
            commandId: 'agentforce.openTrace',
        },
    ];
    const fakeAgentforcePath = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'packages',
        'lwc',
        'applications',
        'agentforce',
        'agentforce.manifest.json'
    );
    assert.doesNotThrow(() => validate(m, fakeAgentforcePath));
});
