import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getMetadataTypeIcon, METADATA_RECORD_ICON } from '../constants.ts';

test('metadata/menu: METADATA_RECORD_ICON is lucide:file', () => {
    assert.equal(METADATA_RECORD_ICON, 'lucide:file');
});

test('metadata/menu: known types map correctly (case-insensitive)', () => {
    assert.equal(getMetadataTypeIcon('ApexClass'), 'lucide:code-2');
    assert.equal(getMetadataTypeIcon('flow'), 'lucide:git-branch');
    assert.equal(getMetadataTypeIcon('CUSTOMOBJECT'), 'lucide:database');
    assert.equal(getMetadataTypeIcon('PermissionSet'), 'lucide:shield');
});

test('metadata/menu: unknown falls back to "layers"', () => {
    assert.equal(getMetadataTypeIcon('NoSuchType'), 'lucide:layers');
    assert.equal(getMetadataTypeIcon(''), 'lucide:layers');
    assert.equal(getMetadataTypeIcon(null as any), 'lucide:layers');
});
