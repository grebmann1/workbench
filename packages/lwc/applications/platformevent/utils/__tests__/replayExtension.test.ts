import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReplayExtension } from '../replayExtension.ts';

test('ReplayExtension: constructor wires fetchReplayId', () => {
    const fn = (_ch: string) => 42;
    const ext = new ReplayExtension(fn);
    assert.equal(ext.fetchReplayId, fn);
});

test('ReplayExtension: incoming returns message verbatim', () => {
    const ext = new ReplayExtension(() => 0);
    const msg = { channel: '/topic/x', data: { foo: 1 } };
    assert.equal(ext.incoming(msg), msg);
});

test('ReplayExtension: outgoing attaches replayId for subscribe messages', () => {
    const ext = new ReplayExtension((ch: string) => (ch === '/event/A' ? 7 : -1));
    const msg: any = { channel: '/meta/subscribe', subscription: '/event/A' };
    const out = ext.outgoing(msg);
    assert.equal(out.ext.replay['/event/A'], 7);
});

test('ReplayExtension: outgoing preserves existing ext + leaves non-subscribe alone', () => {
    const ext = new ReplayExtension(() => 99);
    const publish: any = { channel: '/meta/connect', id: '1' };
    const out = ext.outgoing(publish);
    assert.equal(out.ext, undefined);
    assert.equal(out.channel, '/meta/connect');
});

test('ReplayExtension: outgoing merges onto existing ext object', () => {
    const ext = new ReplayExtension(() => 3);
    const msg: any = {
        channel: '/meta/subscribe',
        subscription: '/event/B',
        ext: { someOther: true },
    };
    const out = ext.outgoing(msg);
    assert.equal(out.ext.someOther, true);
    assert.equal(out.ext.replay['/event/B'], 3);
});
