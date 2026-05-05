import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const rowTemplate = readFileSync(new URL('../recordExplorerRow.html', import.meta.url), 'utf8');
const inputTemplate = readFileSync(
    new URL('../../../../main/component/slds/inputField/inputField.html', import.meta.url),
    'utf8'
);

test('record explorer row hides the input label inside editable table cells', () => {
    assert.match(rowTemplate, /<slds-input-field\s+field-name=\{name\}\s+variant="label-hidden"/);
});

test('record explorer row can suppress the default none option for special picklists', () => {
    assert.match(rowTemplate, /suppress-none-option=\{suppressNoneOption\}/);
    assert.match(inputTemplate, /suppress-none-option=\{suppressNoneOption\}/);
});
