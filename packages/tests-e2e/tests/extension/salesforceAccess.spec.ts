import fs from 'node:fs/promises';
import { test, expect } from './fixtures';
import { mockOrg, ORIGIN, RECORD_ID } from './salesforceFixture';

const USER_ID = '005000000000002AAA';
const PROFILE_ID = '00e000000000001AAA';
const PERMISSION_ID = '0PS000000000001AAA';

test('a record access investigation separates field denial, record sharing and unavailable evidence', async ({
    context,
    extensionId,
}) => {
    let fieldUnavailable = false;
    let recordEditable = true;
    const requests = await mockOrg(context, url => {
        if (!url.pathname.includes('/query')) return;
        const query = url.searchParams.get('q') || '';
        let records;
        if (query.includes('FROM User WHERE'))
            records = [
                {
                    Id: USER_ID,
                    Name: 'Target Expert',
                    Username: 'target@example.test',
                    IsActive: true,
                    ProfileId: PROFILE_ID,
                },
            ];
        if (query.includes('FROM UserEntityAccess'))
            records = [{ UserId: USER_ID, IsReadable: true, IsEditable: true }];
        if (query.includes('FROM UserFieldAccess')) {
            if (fieldUnavailable)
                return {
                    status: 403,
                    body: [
                        {
                            errorCode: 'INSUFFICIENT_ACCESS',
                            message: 'Field access evidence denied',
                        },
                    ],
                };
            records = [{ UserId: USER_ID, IsAccessible: true, IsUpdatable: false }];
        }
        if (query.includes('FROM UserRecordAccess'))
            records = [{ RecordId: RECORD_ID, HasReadAccess: true, HasEditAccess: recordEditable }];
        if (query.includes('FROM PermissionSet WHERE'))
            records = [{ Id: PERMISSION_ID, Label: 'Expert profile', ProfileId: PROFILE_ID }];
        if (query.includes('FROM PermissionSetAssignment')) records = [];
        if (query.includes('FROM ObjectPermissions'))
            records = [{ ParentId: PERMISSION_ID, PermissionsRead: true, PermissionsEdit: true }];
        if (query.includes('FROM FieldPermissions'))
            records = [{ ParentId: PERMISSION_ID, PermissionsRead: true, PermissionsEdit: false }];
        if (records) return { body: { done: true, totalSize: records.length, records } };
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(
        `chrome-extension://${extensionId}/views/app.html?${new URLSearchParams({ applicationName: 'access', sessionId: 'fixture-session-only', serverUrl: ORIGIN })}`
    );
    const investigation = page.getByRole('region', {
        name: 'User access investigation',
        exact: true,
    });
    await investigation.getByLabel('Object API name').fill('Account');
    await investigation.getByLabel('Record ID').fill(RECORD_ID);
    await investigation.getByLabel('Field API name (optional)', { exact: true }).fill('Name');
    await investigation.getByLabel('Find a target user', { exact: true }).fill('Target');
    await investigation.getByRole('button', { name: 'Find users', exact: true }).click();
    await investigation
        .getByRole('button', { name: 'Target Expert · target@example.test', exact: true })
        .click();
    expect(requests.some(request => request.includes('FROM UserRecordAccess'))).toBe(false);
    await investigation.getByRole('button', { name: 'Run access checks', exact: true }).click();
    const findings = investigation.getByRole('region', { name: 'Access findings', exact: true });
    await expect(findings.getByRole('row', { name: /^Field: Name/ })).toContainText('Not allowed');
    await expect(findings.getByRole('row', { name: /^Object: Account/ })).not.toContainText(
        'Not allowed'
    );
    await expect(findings.getByText('Expert profile', { exact: true })).toBeVisible();
    await expect(findings).toContainText('cannot edit the selected field');
    fieldUnavailable = true;
    recordEditable = false;
    await investigation.getByRole('button', { name: 'Run access checks', exact: true }).click();
    await expect(findings.getByRole('row', { name: /^Field: Name/ })).toContainText('Unavailable');
    await expect(findings.getByRole('row', { name: /^Field: Name/ })).toContainText('Unknown');
    await expect(findings.getByRole('row', { name: /^Record:/ })).toContainText('Not allowed');
    const downloaded = page.waitForEvent('download');
    await investigation
        .getByRole('button', { name: 'Export access evidence', exact: true })
        .click();
    const note = await fs.readFile((await (await downloaded).path())!, 'utf8');
    expect(note).toContain(`Target user: Target Expert (target@example.test; ${USER_ID})`);
    expect(note).toContain('Connected user:');
    expect(note).toContain('Field: Name — Unavailable');
    expect(note).toContain('Restriction rules');
    expect(note).not.toContain('fixture-session-only');
    await fs.mkdir('.zcc/artifacts/salesforce-access', { recursive: true });
    await investigation
        .getByRole('heading', { name: 'Investigate user access', exact: true })
        .scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.zcc/artifacts/salesforce-access/access.png', fullPage: true });
    await findings
        .getByRole('heading', { name: 'Access findings', exact: true })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: '.zcc/artifacts/salesforce-access/findings.png',
        fullPage: true,
    });
    expect(requests.some(request => request.includes('executeAnonymous'))).toBe(false);
    expect(requests.every(request => request.startsWith('GET '))).toBe(true);
    expect(errors).toEqual([]);
});

for (const message of [
    'BlackTab users cannot perform API operations',
    'Session expired or invalid',
]) {
    test(`connection probe stops promptly for ${message}`, async ({ context, extensionId }) => {
        const requests = await mockOrg(context, () => ({
            status: 401,
            body: [{ errorCode: 'INVALID_SESSION_ID', message }],
        }));
        const page = await context.newPage();
        await page.goto(
            `chrome-extension://${extensionId}/views/app.html?${new URLSearchParams({ applicationName: 'recordviewer', recordId: RECORD_ID, sessionId: 'fixture-session-only', serverUrl: ORIGIN })}`
        );
        await expect.poll(() => requests.length).toBeGreaterThan(0);
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        // Observe repeated render/connection work long enough to expose the old retry loop.
        await page.waitForTimeout(1500);
        const settled = requests.length;
        await fs.mkdir('.zcc/artifacts/salesforce-access', { recursive: true });
        await fs.writeFile(
            `.zcc/artifacts/salesforce-access/${message.startsWith('BlackTab') ? 'blacktab' : 'expired'}-requests.json`,
            JSON.stringify(requests, null, 2)
        );
        await page.waitForTimeout(1500);
        expect(requests.length).toBe(settled);
        expect(settled).toBeLessThanOrEqual(3);
        expect(requests.some(request => request.includes('/token'))).toBe(false);
    });
}
