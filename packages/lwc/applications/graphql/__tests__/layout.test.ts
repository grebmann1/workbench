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

test('graphql/app layout: catalog toggle is rendered in the left header meta slot', () => {
    assert.match(
        template,
        /<div slot="meta" class="slds-flex-row slds-align-flex-end">\s*<lightning-button-icon-stateful[\s\S]*?selected=\{isCatalogToggled\}[\s\S]*?icon-name="utility:knowledge_base"[\s\S]*?onclick=\{handleCatalogToggle\}/
    );
    assert.doesNotMatch(getSubactionsBlock(), /selected=\{isCatalogToggled\}|handleCatalogToggle/);
});

test('graphql/app layout: catalog panel is mounted before the main article for left docking', () => {
    const catalogPanelIndex = template.indexOf('<graphql-catalog-panel');
    const articleIndex = template.indexOf('<article class="full-page-body slds-card">');

    assert.notEqual(catalogPanelIndex, -1);
    assert.notEqual(articleIndex, -1);
    assert.ok(catalogPanelIndex < articleIndex);
});
