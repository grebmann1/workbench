const assert = require('node:assert/strict');
const test = require('node:test');

const {
    analyzeStorageScenario,
    getRecoverableWrongBackendKeys,
} = require('../stored-query-storage-scenario-console.js');

test('detects saved query files restored into chrome storage instead of localStorage', () => {
    const report = analyzeStorageScenario({
        localStorage: {},
        chromeStorageLocal: {
            QUERYFILES: [
                {
                    id: 'accounts',
                    name: 'Accounts',
                    content: 'SELECT Id FROM Account',
                    isGlobal: false,
                    alias: 'prod',
                    extra: { folder: 'Sales', tags: [] },
                },
            ],
        },
        currentAlias: 'prod',
    });

    assert.equal(report.documentKeys.QUERYFILES.status, 'wrong-backend');
    assert.deepEqual(getRecoverableWrongBackendKeys(report), ['QUERYFILES']);
    assert.equal(report.summary.hasRecoverableWrongBackendDocuments, true);
});

test('reports alias-hidden saved queries separately from missing storage', () => {
    const report = analyzeStorageScenario({
        localStorage: {
            QUERYFILES: [
                {
                    id: 'accounts',
                    name: 'Accounts',
                    content: 'SELECT Id FROM Account',
                    isGlobal: false,
                    alias: 'old-prod',
                    extra: { folder: 'Sales', tags: [] },
                },
                {
                    id: 'global-users',
                    name: 'Global Users',
                    content: 'SELECT Id FROM User',
                    isGlobal: true,
                    alias: null,
                    extra: {},
                },
            ],
        },
        chromeStorageLocal: {},
        currentAlias: 'prod',
    });

    assert.equal(report.documentKeys.QUERYFILES.status, 'ok-local');
    assert.equal(report.aliasVisibility.QUERYFILES.totalItems, 2);
    assert.equal(report.aliasVisibility.QUERYFILES.visibleForCurrentAlias, 1);
    assert.equal(report.aliasVisibility.QUERYFILES.hiddenByAlias, 1);
    assert.deepEqual(report.aliasVisibility.QUERYFILES.aliases, ['old-prod']);
});

test('flags malformed local saved query payloads that would load as empty', () => {
    const report = analyzeStorageScenario({
        localStorage: {
            QUERYFILES: '{not json',
        },
        chromeStorageLocal: {},
        currentAlias: 'prod',
    });

    assert.equal(report.documentKeys.QUERYFILES.status, 'malformed-local');
    assert.match(report.documentKeys.QUERYFILES.local.error, /JSON/);
});
