import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const template = readFileSync(new URL('../app/app.html', import.meta.url), 'utf8');

function getSubactionsBlock() {
    const subactionsStart = template.indexOf('<div slot="subactions"');
    const metaStart = template.indexOf('<template lwc:if={isMetaDisplayed}>');
    assert.notEqual(subactionsStart, -1);
    assert.notEqual(metaStart, -1);
    return template.slice(subactionsStart, metaStart);
}

test('soql/app layout: dictionary toggle is rendered in the left header meta slot', () => {
    assert.match(
        template,
        /<div slot="meta" class="slds-flex-row slds-align-flex-end">\s*<lightning-button-icon-stateful[\s\S]*?selected=\{isLeftToggled\}[\s\S]*?icon-name="utility:knowledge_base"[\s\S]*?onclick=\{handleLeftToggle\}/
    );
    assert.doesNotMatch(getSubactionsBlock(), /selected=\{isLeftToggled\}|handleLeftToggle/);
});
