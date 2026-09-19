import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampPanelWidth, resizeWithKeyboard } from '../resize';

test('panel width stays inside bounds, including a parent narrower than the minimum', () => {
    assert.equal(clampPanelWidth(100, 260, 500), 260);
    assert.equal(clampPanelWidth(1000, 260, 500), 500);
    assert.equal(clampPanelWidth(400, 260, 200), 200);
});
test('keyboard moves the separator in the correct direction with coarse adjustment and limits', () => {
    assert.equal(resizeWithKeyboard(400, 'ArrowLeft', 'right', false, 260, 500), 410);
    assert.equal(resizeWithKeyboard(400, 'ArrowRight', 'left', true, 260, 500), 450);
    assert.equal(resizeWithKeyboard(490, 'ArrowLeft', 'right', true, 260, 500), 500);
    assert.equal(resizeWithKeyboard(400, 'Home', 'right', false, 260, 500), 260);
    assert.equal(resizeWithKeyboard(400, 'End', 'right', false, 260, 500), 500);
    assert.equal(resizeWithKeyboard(400, 'Tab', 'right', false, 260, 500), null);
});
