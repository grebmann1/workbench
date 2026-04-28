import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const manifest = JSON.parse(fs.readFileSync('packages/extension/manifest.template.json', 'utf8'));

test('manifest lists debugger as a required permission', () => {
    assert.ok(manifest.permissions.includes('debugger'));
    assert.equal(manifest.optional_permissions?.includes('debugger') === true, false);
});
