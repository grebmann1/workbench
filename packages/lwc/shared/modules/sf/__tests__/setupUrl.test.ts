// setupUrl.test.ts
// Module: shared/sf/setupUrl
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSetupUrl } from '../setupUrl.ts';

const ORG = 'https://acme.my.salesforce.com';

test('Flow target builds the expected URL', () => {
    assert.equal(
        buildSetupUrl(ORG, { type: 'Flow', name: 'MyFlow' }),
        'https://acme.my.salesforce.com/lightning/setup/Flows/page?address=%2FMyFlow'
    );
});

test('ApexClass target builds the expected URL', () => {
    assert.equal(
        buildSetupUrl(ORG, { type: 'ApexClass', name: 'MyClass' }),
        'https://acme.my.salesforce.com/lightning/setup/ApexClasses/page?address=%2FMyClass'
    );
});

test('BotDefinition with a 15-char ID builds Einstein Copilot edit URL', () => {
    const id = '0XxKZ0000004C92'; // 15 chars
    assert.equal(id.length, 15);
    assert.equal(
        buildSetupUrl(ORG, { type: 'BotDefinition', id }),
        `https://acme.my.salesforce.com/lightning/setup/EinsteinCopilot/${id}/edit`
    );
});

test('BotDefinition with an 18-char ID builds Einstein Copilot edit URL', () => {
    const id = '0XxKZ0000004C92AAA'; // 18 chars
    assert.equal(id.length, 18);
    assert.equal(
        buildSetupUrl(ORG, { type: 'BotDefinition', id }),
        `https://acme.my.salesforce.com/lightning/setup/EinsteinCopilot/${id}/edit`
    );
});

test('Record target with valid 15-char ID returns classic record URL', () => {
    const id = '001000000000001';
    assert.equal(id.length, 15);
    assert.equal(
        buildSetupUrl(ORG, { type: 'Record', id }),
        `https://acme.my.salesforce.com/${id}`
    );
});

test('Record target with valid 18-char ID returns classic record URL', () => {
    const id = '001000000000001AAA';
    assert.equal(id.length, 18);
    assert.equal(
        buildSetupUrl(ORG, { type: 'Record', id }),
        `https://acme.my.salesforce.com/${id}`
    );
});

test('Trailing-slash org URL is normalized', () => {
    assert.equal(
        buildSetupUrl('https://acme.my.salesforce.com/', { type: 'Flow', name: 'MyFlow' }),
        'https://acme.my.salesforce.com/lightning/setup/Flows/page?address=%2FMyFlow'
    );
    assert.equal(
        buildSetupUrl('https://acme.my.salesforce.com///', {
            type: 'Record',
            id: '001000000000001',
        }),
        'https://acme.my.salesforce.com/001000000000001'
    );
});

test('Invalid orgInstanceUrl (non-https) throws', () => {
    assert.throws(
        () => buildSetupUrl('http://acme.my.salesforce.com', { type: 'Flow', name: 'MyFlow' }),
        /must start with "https:\/\/"/
    );
    assert.throws(
        () => buildSetupUrl('acme.my.salesforce.com', { type: 'Flow', name: 'MyFlow' }),
        /must start with "https:\/\/"/
    );
});

test('Empty orgInstanceUrl throws', () => {
    assert.throws(
        () => buildSetupUrl('', { type: 'Flow', name: 'MyFlow' }),
        /must be a non-empty string/
    );
    assert.throws(
        () => buildSetupUrl('   ', { type: 'Flow', name: 'MyFlow' }),
        /must be a non-empty string/
    );
});

test('Invalid Salesforce ID throws (too short / too long / bad chars)', () => {
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'BotDefinition', id: '12345' }),
        /15- or 18-character Salesforce ID/
    );
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'BotDefinition', id: '0XxKZ0000004C92AAAA' }), // 19 chars
        /15- or 18-character Salesforce ID/
    );
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'Record', id: '001-00000000001' }),
        /15- or 18-character Salesforce ID/
    );
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'Record', id: '' }),
        /15- or 18-character Salesforce ID/
    );
});

test('Name with special characters is URL-encoded', () => {
    assert.equal(
        buildSetupUrl(ORG, { type: 'Flow', name: 'My Flow With Spaces' }),
        'https://acme.my.salesforce.com/lightning/setup/Flows/page?address=%2FMy%20Flow%20With%20Spaces'
    );
    // Underscores are safe in encodeURIComponent and pass through unchanged.
    assert.equal(
        buildSetupUrl(ORG, { type: 'ApexClass', name: 'Flow_with_underscores' }),
        'https://acme.my.salesforce.com/lightning/setup/ApexClasses/page?address=%2FFlow_with_underscores'
    );
    assert.equal(
        buildSetupUrl(ORG, { type: 'Flow', name: 'Flow/With?Special&Chars' }),
        'https://acme.my.salesforce.com/lightning/setup/Flows/page?address=%2FFlow%2FWith%3FSpecial%26Chars'
    );
});

test('Empty name throws', () => {
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'Flow', name: '' }),
        /must be a non-empty string/
    );
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'ApexClass', name: '' }),
        /must be a non-empty string/
    );
});

test('Name with leading/trailing whitespace throws', () => {
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'Flow', name: ' MyFlow' }),
        /leading or trailing whitespace/
    );
    assert.throws(
        () => buildSetupUrl(ORG, { type: 'ApexClass', name: 'MyClass ' }),
        /leading or trailing whitespace/
    );
});
