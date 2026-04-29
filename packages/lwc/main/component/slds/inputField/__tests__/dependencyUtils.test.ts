import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isInDependencyChain, hasDependents, isControllerMissing } from '../dependencyUtils.ts';

test('hasDependents: true when another field is controlled by uiField + present in picklistValues', () => {
    const uiField = { apiName: 'Country' };
    const fields = {
        Country: { apiName: 'Country' },
        State: { apiName: 'State', controllerName: 'Country' },
    };
    const picklistValues = { State: {} };
    assert.equal(hasDependents(uiField, fields, picklistValues), true);
});

test('hasDependents: false when dependent has no entry in picklistValues', () => {
    const uiField = { apiName: 'Country' };
    const fields = {
        Country: { apiName: 'Country' },
        State: { apiName: 'State', controllerName: 'Country' },
    };
    assert.equal(hasDependents(uiField, fields, {}), false);
});

test('isInDependencyChain: true if uiField has a controlling picklist in the form', () => {
    const uiField = { apiName: 'State', controllerName: 'Country' };
    const fields = { Country: { dataType: 'picklist' } };
    const picklistValues = { Country: {} };
    assert.equal(isInDependencyChain(uiField, fields, picklistValues), true);
});

test('isInDependencyChain: true when controller is a checkbox (boolean)', () => {
    const uiField = { apiName: 'Dependent', controllerName: 'IsActive' };
    const fields = { IsActive: { dataType: 'boolean' } };
    assert.equal(isInDependencyChain(uiField, fields, {}), true);
});

test('isInDependencyChain: false when neither controller nor dependent present', () => {
    const uiField = { apiName: 'State', controllerName: 'Country' };
    assert.equal(isInDependencyChain(uiField, {}, {}), false);
});

test('isControllerMissing: true when controller field exists but not as picklist or checkbox', () => {
    const uiField = { apiName: 'State', controllerName: 'Country' };
    const fields = { Country: { dataType: 'string' } };
    assert.equal(isControllerMissing(uiField, fields, {}), true);
});

test('isControllerMissing: false when controller picklist IS in form', () => {
    const uiField = { apiName: 'State', controllerName: 'Country' };
    const fields = { Country: { dataType: 'picklist' } };
    const picklistValues = { Country: {} };
    assert.equal(isControllerMissing(uiField, fields, picklistValues), false);
});
