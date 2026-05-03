import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compileSalesforceCliCommand } from '../desktopSalesforceCliGrammar.ts';

const ORG = { kind: 'alias' as const, alias: 'demo-org' };

test('api request: positional METHOD + URL', () => {
    const cmd = compileSalesforceCliCommand(
        ['api', 'request', 'GET', '/services/data/v59.0/limits', '--target-org', 'demo-org'],
        { json: false, org: ORG }
    );
    assert.equal(cmd.type, 'execute');
    if (cmd.type === 'execute' && cmd.action.kind === 'apiRequest') {
        assert.equal(cmd.action.method, 'GET');
        assert.equal(cmd.action.endpoint, '/services/data/v59.0/limits');
    } else {
        assert.fail('expected apiRequest command');
    }
});

test('api request: positional defaults method to GET when only URL given', () => {
    const cmd = compileSalesforceCliCommand(['api', 'request', '/x'], { json: false, org: ORG });
    if (cmd.type === 'execute' && cmd.action.kind === 'apiRequest') {
        assert.equal(cmd.action.method, 'GET');
        assert.equal(cmd.action.endpoint, '/x');
    } else {
        assert.fail('expected apiRequest command');
    }
});

test('api request: repeated -H headers concatenated newline-joined', () => {
    const cmd = compileSalesforceCliCommand(
        [
            'api',
            'request',
            'POST',
            '/x',
            '-H',
            'Content-Type: application/json',
            '-H',
            'Accept: application/json',
        ],
        { json: false, org: ORG }
    );
    if (cmd.type === 'execute' && cmd.action.kind === 'apiRequest') {
        assert.match(
            cmd.action.headerText,
            /Content-Type: application\/json\nAccept: application\/json/
        );
    } else {
        assert.fail('expected apiRequest command');
    }
});

test('api request: --json propagates output=json', () => {
    const cmd = compileSalesforceCliCommand(['api', 'request', 'GET', '/x'], {
        json: true,
        org: ORG,
    });
    if (cmd.type === 'execute') {
        assert.equal(cmd.output, 'json');
    } else {
        assert.fail('expected execute command');
    }
});

test('api request: legacy --url / --method flags still accepted', () => {
    const cmd = compileSalesforceCliCommand(
        ['api', 'request', '--url', '/x', '--method', 'PATCH'],
        { json: false, org: ORG }
    );
    if (cmd.type === 'execute' && cmd.action.kind === 'apiRequest') {
        assert.equal(cmd.action.method, 'PATCH');
        assert.equal(cmd.action.endpoint, '/x');
    } else {
        assert.fail('expected apiRequest command');
    }
});

test('api request: missing endpoint throws', () => {
    assert.throws(
        () => compileSalesforceCliCommand(['api', 'request'], { json: false, org: ORG }),
        /Missing API endpoint/
    );
});
