import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classSet } from '../classSet.ts';

test('classSet: seeded from a string marks the class true', () => {
    const s = classSet('foo');
    assert.equal(s.toString(), 'foo');
});

test('classSet: seeded from an object preserves flags', () => {
    const s = classSet({ foo: true, bar: false, baz: true });
    assert.equal(s.toString(), 'foo baz');
});

test('classSet.add: string sets flag to true', () => {
    const s = classSet({});
    s.add('x');
    assert.equal(s.toString(), 'x');
});

test('classSet.add: object merges flags', () => {
    const s = classSet({ a: true });
    s.add({ b: true, c: false });
    assert.equal(s.toString(), 'a b');
});

test('classSet.add: re-adding overwrites false with true', () => {
    const s = classSet({ x: false });
    s.add('x');
    assert.equal(s.toString(), 'x');
});

test('classSet.add: returns the same instance (chainable)', () => {
    const s = classSet('a');
    const r = s.add('b').add({ c: true });
    assert.equal(r, s);
    assert.equal(s.toString(), 'a b c');
});

test('classSet.invert: flips boolean flags, ignores non-boolean entries', () => {
    const s = classSet({ a: true, b: false });
    s.invert();
    assert.equal(s.toString(), 'b');
});

test('classSet.toString: only emits entries whose value is strictly true', () => {
    const s = classSet({ a: true, b: false, c: 1 as unknown as boolean, d: true });
    // `c` is numeric 1, which is !== true, so it should not appear.
    assert.equal(s.toString(), 'a d');
});
