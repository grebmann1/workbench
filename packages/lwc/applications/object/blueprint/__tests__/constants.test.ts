import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBlueprintFlowUrl, buildBlueprintSetupUrl } from '../constants.ts';

test('buildBlueprintSetupUrl reuses canonical setup routes', () => {
    assert.equal(
        buildBlueprintSetupUrl('validationRules', '04x123', 'Account'),
        '/lightning/setup/ObjectManager/Account/ValidationRules/04x123/view'
    );
    assert.equal(
        buildBlueprintSetupUrl('apexClasses', '01p123', 'Account'),
        '/lightning/setup/ApexClasses/page?address=%2F01p123'
    );
    assert.equal(
        buildBlueprintSetupUrl('scheduledJobs', '', 'Account'),
        '/lightning/setup/ScheduledJobs/home'
    );
});

test('buildBlueprintSetupUrl handles section links and fallback', () => {
    assert.equal(
        buildBlueprintSetupUrl('formulaFields', '', 'Account'),
        '/lightning/setup/ObjectManager/Account/FieldsAndRelationships/view'
    );
    assert.equal(
        buildBlueprintSetupUrl('formulaFields', '00N123', 'Account'),
        '/lightning/setup/ObjectManager/Account/FieldsAndRelationships/00N123/view'
    );
    assert.equal(buildBlueprintSetupUrl('unknown', 'id', 'Account'), '');
});

test('buildBlueprintFlowUrl returns flowBuilder links when version exists', () => {
    assert.equal(
        buildBlueprintFlowUrl('301AAA', '301BBB'),
        '/builder_platform_interaction/flowBuilder.app?flowId=301AAA'
    );
    assert.equal(
        buildBlueprintFlowUrl(null, '301BBB'),
        '/builder_platform_interaction/flowBuilder.app?flowId=301BBB'
    );
    assert.equal(buildBlueprintFlowUrl(null, null), '');
});
