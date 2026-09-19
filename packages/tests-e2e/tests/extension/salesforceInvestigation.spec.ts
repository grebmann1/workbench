import fs from 'node:fs/promises';
import { test, expect } from './fixtures';

import { ORIGIN, ORG_ID, RECORD_ID, mockOrg } from './salesforceFixture';

test('Record Explorer keeps its compact table and original SOQL toolbar action', async ({
    context,
    extensionId,
}) => {
    const requests = await mockOrg(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const params = new URLSearchParams({
        applicationName: 'recordviewer',
        recordId: RECORD_ID,
        sessionId: 'fixture-session-only',
        serverUrl: ORIGIN,
    });
    await page.goto(`chrome-extension://${extensionId}/views/app.html?${params}`);
    const record = page.locator('recordviewer-record-explorer');
    await expect(record.getByText('Investigation fixture', { exact: true })).toBeVisible();
    await expect(record.getByText('Technology', { exact: true })).toBeVisible();
    await expect(record.getByRole('checkbox')).toHaveCount(0);
    await expect(record.getByText('Investigate this record', { exact: true })).toHaveCount(0);
    await fs.mkdir('.zcc/artifacts/record-explorer-rollback', { recursive: true });
    await page.screenshot({
        path: '.zcc/artifacts/record-explorer-rollback/record.png',
        fullPage: true,
    });
    await record.getByRole('button', { name: 'Open in SOQL Explorer', exact: true }).click();
    const soql = page.locator('soql-app');
    await expect(soql.locator('editor-soql')).toBeVisible();
    await expect(soql.getByRole('region', { name: 'Record investigation' })).toHaveCount(0);
    await expect(soql.locator('editor-soql .view-lines')).toContainText('SELECT Id FROM Account');
    expect(requests.some(request => /SELECT Id FROM Account/.test(request))).toBe(false);
    expect(requests.some(request => request.includes('executeAnonymous'))).toBe(false);
    expect(errors).toEqual([]);
});

test('Blueprint evidence and record return remain available for contextual links', async ({
    context,
    extensionId,
}) => {
    await mockOrg(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const investigation = {
        version: 1,
        id: 'blueprint-fixture',
        instanceUrl: ORIGIN,
        orgId: ORG_ID,
        objectName: 'Account',
        recordId: RECORD_ID,
        fields: ['Name', 'Industry'],
        useToolingApi: false,
        category: 'validationRules',
    };
    const params = new URLSearchParams({
        applicationName: 'sobject',
        attribute1: 'Account',
        attribute2: 'standard',
        investigation: JSON.stringify(investigation),
        sessionId: 'fixture-session-only',
        serverUrl: ORIGIN,
    });
    await page.goto(`chrome-extension://${extensionId}/views/app.html?${params}`);
    const blueprint = page.locator('object-blueprint');
    await expect(blueprint).toBeVisible();
    await expect(blueprint.getByText('Require_Account_Name', { exact: true })).toBeVisible();
    await expect(
        page.locator('object-sobject').getByRole('region', { name: 'Record investigation' })
    ).toContainText('does not establish which automation ran');
    await blueprint.getByRole('button', { name: /Access & Sharing/ }).click();
    await blueprint.getByRole('button', { name: /Owner-Based Sharing Rules/ }).click();
    await expect(blueprint.getByText(/Unavailable:.*Sharing metadata/)).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await blueprint.getByRole('button', { name: 'Export Blueprint evidence', exact: true }).click();
    const download = await downloaded;
    const note = await fs.readFile((await download.path())!, 'utf8');
    expect(note).toContain('Require_Account_Name');
    expect(note).toContain('Owner-Based Sharing Rules — Unavailable');
    expect(note).toContain('Apex Classes — Not checked');
    expect(note).toContain(RECORD_ID);
    expect(note).not.toContain('fixture-session-only');
    await page.screenshot({
        path: '.zcc/artifacts/salesforce-investigation/blueprint.png',
        fullPage: true,
    });
    await page
        .locator('object-sobject')
        .getByRole('button', { name: 'Return to record', exact: true })
        .click();
    const record = page.locator('recordviewer-record-explorer');
    await expect(record.getByText('Investigation fixture', { exact: true })).toBeVisible();
    await expect(record.getByRole('checkbox')).toHaveCount(0);
    await page.screenshot({
        path: '.zcc/artifacts/salesforce-investigation/record.png',
        fullPage: true,
    });
    expect(errors).toEqual([]);
});
