import type { BrowserContext } from '@playwright/test';

export const ORIGIN = 'https://expert-workflow.my.salesforce.com';
export const RECORD_ID = '001000000000001AAA';
export const ORG_ID = '00D000000000001AAA';
const object = {
    name: 'Account',
    label: 'Account',
    labelPlural: 'Accounts',
    keyPrefix: '001',
    queryable: true,
    searchable: true,
    layoutable: true,
    retrieveable: true,
};
const fields = ['Id', 'Name', 'Industry'].map(name => ({
    name,
    label: name,
    type: name === 'Id' ? 'id' : 'string',
    updateable: name !== 'Id',
    createable: name !== 'Id',
    filterable: true,
    sortable: true,
    nillable: name !== 'Id',
    length: 255,
}));

export async function mockOrg(
    context: BrowserContext,
    respond?: (url: URL) => { status?: number; body: unknown } | undefined
) {
    const requests: string[] = [];
    await context.route(`${ORIGIN}/**`, async route => {
        const url = new URL(route.request().url());
        requests.push(
            `${route.request().method()} ${url.pathname} ${url.searchParams.get('q') || ''}`
        );
        const custom = respond?.(url);
        if (custom) {
            await route.fulfill({
                status: custom.status || 200,
                contentType: 'application/json',
                body: JSON.stringify(custom.body),
            });
            return;
        }
        const path = url.pathname;
        let body: unknown;
        if (path.includes('/services/Soap/')) {
            await route.fulfill({
                status: 500,
                contentType: 'text/xml',
                body: '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>INSUFFICIENT_ACCESS</faultcode><faultstring>Sharing metadata access denied</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>',
            });
            return;
        }
        if (path.includes('userinfo') || path.startsWith('/id/')) {
            body = {
                id: `${ORIGIN}/id/${ORG_ID}/005000000000001AAA`,
                user_id: '005000000000001AAA',
                organization_id: ORG_ID,
                username: 'expert@example.test',
                display_name: 'Expert Fixture',
                organization_type: 'Developer Edition',
            };
        } else if (/^\/services\/data\/v[\d.]+\/?$/.test(path)) {
            body = { identity: `${ORIGIN}/id/${ORG_ID}/005000000000001AAA` };
        } else if (path === '/services/data/') {
            body = [{ version: '65.0', label: 'Fixture API', url: '/services/data/v65.0' }];
        } else if (path.endsWith('/sobjects') || path.endsWith('/sobjects/')) {
            body = { sobjects: path.includes('/tooling/') ? [] : [object] };
        } else if (path.endsWith('/sobjects/Account/describe')) {
            body = { ...object, fields, childRelationships: [], recordTypeInfos: [], urls: {} };
        } else if (path.endsWith(`/sobjects/Account/${RECORD_ID}`)) {
            body = {
                Id: RECORD_ID,
                Name: 'Investigation fixture',
                Industry: 'Technology',
                attributes: { type: 'Account' },
            };
        } else if (path.includes('/query')) {
            const query = url.searchParams.get('q') || '';
            let records: unknown[] = [];
            if (query.includes('FROM Organization')) {
                records = [
                    {
                        Id: ORG_ID,
                        Name: 'Expert Workflow Fixture',
                        OrganizationType: 'Developer Edition',
                        CreatedDate: '2026-01-01T00:00:00.000Z',
                        IsSandbox: true,
                    },
                ];
            }
            if (query.includes('FROM ValidationRule')) {
                records = query.includes('SELECT Id, Metadata')
                    ? [{ Id: '03d000000000001AAA', Metadata: { errorMessage: 'Name required' } }]
                    : [
                          {
                              Id: '03d000000000001AAA',
                              ValidationName: 'Require_Account_Name',
                              Active: true,
                              Description: 'Require an account name',
                          },
                      ];
            }
            if (query.includes('Count(Id)')) records = [{ total: 1 }];
            body = { done: true, totalSize: records.length, records };
        } else if (path.endsWith('/limits')) {
            body = { DailyApiRequests: { Max: 15000, Remaining: 14999 } };
        } else {
            body = {};
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    return requests;
}
