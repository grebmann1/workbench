import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const template = readFileSync(new URL('../recordExplorer.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../recordExplorer.css', import.meta.url), 'utf8');

test('record explorer table gives the value column more horizontal space', () => {
    assert.match(
        template,
        /<colgroup>\s*<col class="field-column"\s*\/>\s*<col class="value-column"\s*\/>\s*<\/colgroup>/
    );
    assert.match(styles, /\.field-column\s*\{[^}]*width:\s*34%;[^}]*\}/s);
    assert.match(styles, /\.value-column\s*\{[^}]*width:\s*66%;[^}]*\}/s);
});
