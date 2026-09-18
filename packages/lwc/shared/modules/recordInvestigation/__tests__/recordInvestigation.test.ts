import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    currentInvestigation,
    parseInvestigation,
    investigationRoute,
    recordEvidenceNote,
} from '../recordInvestigation';

const source = {
    version: 1,
    id: 'investigation-1',
    instanceUrl: 'https://example.my.salesforce.com',
    orgId: '00D000000000001AAA',
    objectName: 'Account',
    recordId: '001000000000001AAA',
    fields: ['Name', 'Industry', 'Name'],
    useToolingApi: false,
    category: 'validationRules',
};
const connection = {
    configuration: { orgId: source.orgId },
    conn: { instanceUrl: source.instanceUrl },
};

test('handoffs preserve record, deduplicated fields and API mode', () => {
    const context = parseInvestigation(JSON.stringify({ ...source, useToolingApi: true }));
    assert.ok(context);
    assert.deepEqual(context.fields, ['Name', 'Industry']);
    const route = investigationRoute(context, 'soql');
    assert.equal(
        route.query,
        "SELECT Id, Name, Industry FROM Account WHERE Id = '001000000000001AAA'"
    );
    assert.equal(parseInvestigation(route.investigation)?.useToolingApi, true);
    assert.equal(investigationRoute(context, 'recordviewer').recordId, source.recordId);
    assert.equal(investigationRoute(context, 'sobject').attribute2, 'tooling');
});

test('context is restricted to its org and strips credentials and unrelated payloads', () => {
    const raw = JSON.stringify({
        ...source,
        accessToken: 'do-not-export',
        targetUser: { secret: true },
    });
    const context = currentInvestigation(raw, connection);
    assert.ok(context);
    assert.doesNotMatch(JSON.stringify(context), /do-not-export|targetUser/);
    assert.equal(
        currentInvestigation(raw, {
            ...connection,
            conn: { instanceUrl: 'https://other.my.salesforce.com' },
        }),
        null
    );
    assert.equal(
        currentInvestigation(raw, {
            ...connection,
            configuration: { orgId: '00D000000000002AAA' },
        }),
        null
    );
    assert.equal(currentInvestigation(raw, null), null);
    assert.ok(
        currentInvestigation(raw, {
            ...connection,
            configuration: { orgId: source.orgId.slice(0, 15) },
        })
    );
});

test('malformed context cannot inject query syntax or a credential-bearing URL', () => {
    for (const patch of [
        { fields: ['Name FROM User'] },
        { objectName: 'Account WHERE Name != null' },
        { recordId: "001000000000001'" },
        { fields: Array(51).fill('Name') },
        { instanceUrl: 'https://user:secret@example.my.salesforce.com' },
        { useToolingApi: 'false' },
        { category: 'arbitrary' },
        { version: 2 },
    ])
        assert.equal(parseInvestigation(JSON.stringify({ ...source, ...patch })), null);
    assert.equal(parseInvestigation('{broken'), null);
});

test('evidence note contains reproducible inputs and explicitly unexamined areas', () => {
    const context = parseInvestigation(JSON.stringify(source));
    assert.ok(context);
    const note = recordEvidenceNote(context, '2026-09-18T12:00:00.000Z');
    assert.match(note, /WHERE Id = '001000000000001AAA'/);
    assert.match(note, /2026-09-18T12:00:00.000Z/);
    assert.match(note, /have not been checked/);
    assert.doesNotMatch(note, /accessToken|frontdoor|sessionId/);
});
