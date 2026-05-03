import assert from 'node:assert/strict';
import { test } from 'node:test';

import { announce, subscribeAnnouncements, __resetAnnounceForTests } from '../announce.ts';

test('announce: polite call delivers to subscriber', () => {
    __resetAnnounceForTests();
    const received: Array<{ message: string; assertive?: boolean }> = [];
    subscribeAnnouncements((message, options) => {
        received.push({ message, assertive: options.assertive });
    });
    announce('Hello');
    assert.deepEqual(received, [{ message: 'Hello', assertive: undefined }]);
});

test('announce: assertive option is forwarded', () => {
    __resetAnnounceForTests();
    const received: Array<{ message: string; assertive?: boolean }> = [];
    subscribeAnnouncements((message, options) => {
        received.push({ message, assertive: options.assertive });
    });
    announce('Session expired', { assertive: true });
    assert.deepEqual(received, [{ message: 'Session expired', assertive: true }]);
});

test('announce: same message within dedupe window is dropped', () => {
    __resetAnnounceForTests();
    let count = 0;
    subscribeAnnouncements(() => {
        count += 1;
    });
    announce('Loading');
    announce('Loading');
    announce('Loading');
    assert.equal(count, 1);
});

test('announce: different message within dedupe window is not dropped', () => {
    __resetAnnounceForTests();
    const messages: string[] = [];
    subscribeAnnouncements(message => {
        messages.push(message);
    });
    announce('Row 1 added');
    announce('Row 2 added');
    assert.deepEqual(messages, ['Row 1 added', 'Row 2 added']);
});

test('announce: with no subscriber is a no-op (does not throw)', () => {
    __resetAnnounceForTests();
    assert.doesNotThrow(() => announce('Silent'));
});

test('announce: empty / non-string messages are ignored', () => {
    __resetAnnounceForTests();
    let called = false;
    subscribeAnnouncements(() => {
        called = true;
    });
    announce('');
    announce(null as unknown as string);
    announce(undefined as unknown as string);
    assert.equal(called, false);
});

test('subscribeAnnouncements: returned unsubscribe clears the listener', () => {
    __resetAnnounceForTests();
    let count = 0;
    const unsubscribe = subscribeAnnouncements(() => {
        count += 1;
    });
    announce('First');
    unsubscribe();
    announce('Second');
    assert.equal(count, 1);
});

test('subscribeAnnouncements: second subscription replaces the first (hot-reload friendly)', () => {
    __resetAnnounceForTests();
    let first = 0;
    let second = 0;
    subscribeAnnouncements(() => {
        first += 1;
    });
    subscribeAnnouncements(() => {
        second += 1;
    });
    announce('One-off');
    assert.equal(first, 0);
    assert.equal(second, 1);
});
