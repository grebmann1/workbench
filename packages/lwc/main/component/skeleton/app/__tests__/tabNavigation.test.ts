import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTabClose } from '../tabNavigation';

const tabs = ['a', 'b', 'c'].map(id => ({ id, path: id, isTabVisible: true, isDeletable: true }));

test('inactive closure preserves the active page and remaining object identity', () => {
    const result = resolveTabClose(tabs, 'a', 'c');
    assert.equal(result?.nextPath, null);
    assert.equal(result?.remaining[1], tabs[2]);
});

test('active closure selects preceding, next, then home', () => {
    assert.equal(resolveTabClose(tabs, 'b', 'b')?.nextPath, 'a');
    assert.equal(resolveTabClose(tabs, 'a', 'a')?.nextPath, 'b');
    assert.equal(resolveTabClose(tabs, 'c', 'c')?.nextPath, 'b');
    assert.equal(resolveTabClose([tabs[0]], 'a', 'a')?.nextPath, 'home');
});

test('hidden tabs are not navigation fallbacks and protected tabs cannot close', () => {
    assert.equal(
        resolveTabClose([tabs[0], { ...tabs[1], isTabVisible: false }, tabs[2]], 'c', 'c')
            ?.nextPath,
        'a'
    );
    assert.equal(resolveTabClose([{ ...tabs[0], isDeletable: false }], 'a', 'a'), null);
    assert.equal(resolveTabClose(tabs, 'missing', 'b'), null);
});
