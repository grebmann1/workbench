import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheManager, CACHE_ORG_DATA_TYPES } from 'shared/cacheManager';
import { describeSObject } from '../sobject.ts';

test('describe caches the response under the object name and org alias', async t => {
    const data = { fields: [{ name: 'Id', label: 'Record ID' }] };
    t.mock.method(cacheManager, 'loadOrgData', async () => null);
    const save = t.mock.method(cacheManager, 'saveOrgData', async () => {});
    const action = await describeSObject({
        connector: { alias: 'test-org', describe: async () => data },
        sObjectName: 'Account',
    })(
        () => {},
        () => ({ sobject: { ids: [], entities: {} } }),
        undefined
    );
    assert.equal(action.type, describeSObject.fulfilled.type);
    assert.deepEqual(save.mock.calls[0].arguments, [
        'test-org',
        CACHE_ORG_DATA_TYPES.DESCRIBE,
        { sObjectName: 'Account', data },
        'Account',
    ]);
});
