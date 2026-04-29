import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getMetadataTypeIcon, METADATA_RECORD_ICON } from '../constants.ts';

test('package/menu: METADATA_RECORD_ICON', () => {
    assert.equal(METADATA_RECORD_ICON, 'lucide:file');
});

test('package/menu: getMetadataTypeIcon known/unknown', () => {
    assert.equal(getMetadataTypeIcon('ApexTrigger'), 'lucide:zap');
    assert.equal(getMetadataTypeIcon('report'), 'lucide:bar-chart-2');
    assert.equal(getMetadataTypeIcon(''), 'lucide:layers');
    assert.equal(getMetadataTypeIcon('nope'), 'lucide:layers');
});
