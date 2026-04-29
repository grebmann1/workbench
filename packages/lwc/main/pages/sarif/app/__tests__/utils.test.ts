import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level, Rule, FileItem, Item } from '../utils.js';

test('Level.label: capitalizes first char of key', () => {
    assert.equal(new Level('error').label, 'Error');
    assert.equal(new Level('warning').label, 'Warning');
    assert.equal(new Level('').label, '');
});

test('Level.order: error < warning < note < none, unknown → -1', () => {
    assert.equal(new Level('error').order, 0);
    assert.equal(new Level('warning').order, 1);
    assert.equal(new Level('note').order, 2);
    assert.equal(new Level('none').order, 3);
    assert.equal(new Level('mystery').order, -1);
});

test('Level.recurences: sums totalRecords across rules', () => {
    const level = new Level('error');
    level.rules = {
        r1: { totalRecords: 3 },
        r2: { totalRecords: 7 },
    };
    assert.equal(level.recurences, 10);
});

test('Level.description: formats as "<count> <label>"', () => {
    const level = new Level('warning');
    level.rules = { r1: { totalRecords: 2 } };
    assert.equal(level.description, '2 Warning');
});

test('Level.rank_step: bucketed by recurences count', () => {
    const build = (count: number) => {
        const l = new Level('error');
        l.rules = { r: { totalRecords: count } };
        return l.rank_step;
    };
    assert.equal(build(100), 0); // > 50
    assert.equal(build(40), 1); // > 30
    assert.equal(build(20), 2); // > 15
    assert.equal(build(12), 3); // > 10
    assert.equal(build(3), 4); // < 5
});

test('Rule.label: falls back across name → shortDescription.text → "Empty"', () => {
    assert.equal(new Rule('k', { name: 'MyRule' }, 'Error').label, 'MyRule');
    assert.equal(new Rule('k', { shortDescription: { text: 'Short' } }, 'Error').label, 'Short');
    assert.equal(new Rule('k', {}, 'Error').label, 'Empty');
});

test('Rule.totalRecords: sums fileItems.totalRecords', () => {
    const rule = new Rule('k', { name: 'R' }, 'Error');
    rule.files = {
        f1: { totalRecords: 1 },
        f2: { totalRecords: 4 },
    };
    assert.equal(rule.totalRecords, 5);
});

test('Rule.description: formatted with totalRecords + levelLabel', () => {
    const rule = new Rule('k', { name: 'R' }, 'Error');
    rule.files = { f1: { totalRecords: 3 } };
    assert.equal(rule.description, '3 Error');
});

test('FileItem.fileName: last path segment; label prefixed with "file "', () => {
    const f = new FileItem('k', '/src/main/MyClass.cls', 'Error');
    assert.equal(f.fileName, 'MyClass.cls');
    assert.equal(f.label, 'file MyClass.cls');
});

test('FileItem.totalRecords: items.length (records array)', () => {
    const f = new FileItem('k', '/x.cls', 'Error');
    f.records = [{}, {}, {}];
    assert.equal(f.totalRecords, 3);
});

test('Item.label: "line <startLine> : <message>"', () => {
    const item = new Item('k', 'error', 'R1', 'boom', {
        region: { startLine: 12, endLine: 12 },
    });
    assert.equal(item.label, 'line 12 : boom');
});

test('Item.lineNumbers: newline-joined range from startLine..endLine', () => {
    const item = new Item('k', 'error', 'R1', 'x', {
        region: { startLine: 3, endLine: 5 },
    });
    assert.equal(item.lineNumbers, '3\n4\n5');
});

test('Item.snippet / isSnippetDisplayed: from region.snippet.text or "" / boolean', () => {
    const withSnip = new Item('k', 'error', 'R', 'msg', {
        region: { startLine: 1, endLine: 1, snippet: { text: 'code' } },
    });
    assert.equal(withSnip.snippet, 'code');
    assert.equal(withSnip.isSnippetDisplayed, true);

    const noSnip = new Item('k', 'error', 'R', 'msg', { region: { startLine: 1, endLine: 1 } });
    assert.equal(noSnip.snippet, '');
    assert.equal(noSnip.isSnippetDisplayed, false);
});
