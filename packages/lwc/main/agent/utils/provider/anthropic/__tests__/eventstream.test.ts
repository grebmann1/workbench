import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEventstreamFrame } from '../eventstream.ts';

/**
 * Build a minimal AWS vnd.amazon.eventstream frame with NO headers and a JSON
 * payload. The decoder defaults message-type to "event" and derives the event
 * name from the inner Anthropic event's `type`, so empty headers are enough to
 * exercise the base64 → UTF-8 payload decode path.
 *
 *   4B total length (BE) | 4B headers length (BE) | 4B prelude CRC | payload | 4B msg CRC
 */
function buildFrame(payloadJson: string): Uint8Array {
    const payload = new TextEncoder().encode(payloadJson);
    const totalLen = 12 + payload.length + 4; // prelude(12) + payload + msg CRC(4)
    const frame = new Uint8Array(totalLen);
    const view = new DataView(frame.buffer);
    view.setUint32(0, totalLen, false); // total length
    view.setUint32(4, 0, false); // headers length = 0
    view.setUint32(8, 0, false); // prelude CRC (ignored)
    frame.set(payload, 12);
    // trailing 4B message CRC left as zeros (validation is skipped)
    return frame;
}

/** Wrap an inner Anthropic event the way Bedrock does: `{ bytes: base64(json) }`. */
function bedrockEnvelope(inner: object): string {
    const innerJson = JSON.stringify(inner);
    const b64 = Buffer.from(innerJson, 'utf-8').toString('base64');
    return JSON.stringify({ bytes: b64 });
}

test('parseEventstreamFrame: recovers multi-byte UTF-8 text from base64 payload (✓ + em dash + emoji)', () => {
    const text = 'Good ✓ AIApplication — 🔍 valid';
    const frame = buildFrame(
        bedrockEnvelope({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text },
        })
    );

    const result = parseEventstreamFrame(frame);
    assert.ok(result?.frame, 'frame should decode');
    assert.equal(result.frame.event, 'content_block_delta');

    const inner = JSON.parse(result.frame.data);
    // The whole bug: without a UTF-8 re-decode of the base64 bytes, `text` would
    // come back as Latin-1 mojibake ("Good â\x9C\x93 AIApplication …").
    assert.equal(inner.delta.text, text);
});

test('parseEventstreamFrame: ASCII-only payload is unaffected', () => {
    const frame = buildFrame(bedrockEnvelope({ type: 'message_stop' }));
    const result = parseEventstreamFrame(frame);
    assert.ok(result?.frame);
    assert.equal(result.frame.event, 'message_stop');
});
