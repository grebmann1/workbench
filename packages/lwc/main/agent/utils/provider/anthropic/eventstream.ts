/**
 * AWS Bedrock eventstream → Anthropic SSE decoder.
 *
 * Bedrock's `invoke-with-response-stream` endpoint emits binary
 * `application/vnd.amazon.eventstream` frames. Each frame carries a JSON
 * envelope whose base64 `bytes` field contains a standard Anthropic streaming
 * event (message_start, content_block_*, message_delta, message_stop). We
 * re-emit those events as `text/event-stream` so the Anthropic SDK parser can
 * consume them unchanged.
 *
 * Frame layout (AWS vnd.amazon.eventstream):
 *   4B total length (BE) | 4B headers length (BE) | 4B prelude CRC32
 *   Nb headers | Mb payload (JSON) | 4B message CRC32
 *
 * CRC validation is intentionally skipped — the gateway is inside our trust
 * boundary and malformed JSON will be rejected by the Anthropic SDK anyway.
 */

type DecodedFrame = { event: string; data: string };

function readUInt32BE(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] << 24) >>> 0) +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3]
    );
}

function decodeHeaders(bytes: Uint8Array): Record<string, string> {
    const headers: Record<string, string> = {};
    const decoder = new TextDecoder();
    let cursor = 0;
    while (cursor < bytes.length) {
        const nameLen = bytes[cursor];
        cursor += 1;
        const name = decoder.decode(bytes.subarray(cursor, cursor + nameLen));
        cursor += nameLen;
        const type = bytes[cursor];
        cursor += 1;
        // Header value type 7 = string: 2B length + bytes. Others are rare in
        // Bedrock eventstream payloads; skip unknown types safely by bailing out.
        if (type === 7) {
            const valueLen = (bytes[cursor] << 8) + bytes[cursor + 1];
            cursor += 2;
            headers[name] = decoder.decode(bytes.subarray(cursor, cursor + valueLen));
            cursor += valueLen;
        } else {
            break;
        }
    }
    return headers;
}

function decodePayload(headers: Record<string, string>, payload: Uint8Array): DecodedFrame | null {
    const messageType = headers[':message-type'] || 'event';
    const eventType = headers[':event-type'] || headers[':exception-type'] || 'message';
    const decoder = new TextDecoder();
    const raw = decoder.decode(payload);
    if (!raw) return null;

    if (messageType === 'exception' || messageType === 'error') {
        return { event: 'error', data: raw };
    }

    try {
        const envelope = JSON.parse(raw);
        // Bedrock wraps the Anthropic event in `{ bytes: base64(JSON), p: ... }`.
        if (envelope && typeof envelope.bytes === 'string') {
            const decoded =
                typeof atob === 'function'
                    ? atob(envelope.bytes)
                    : Buffer.from(envelope.bytes, 'base64').toString('utf-8');
            const inner = JSON.parse(decoded);
            const type = typeof inner?.type === 'string' ? inner.type : eventType;
            return { event: type, data: JSON.stringify(inner) };
        }
        // Fallback: payload already looks like an Anthropic event.
        const type = typeof envelope?.type === 'string' ? envelope.type : eventType;
        return { event: type, data: JSON.stringify(envelope) };
    } catch {
        return null;
    }
}

export function parseEventstreamFrame(
    buffer: Uint8Array
): { frame: DecodedFrame | null; consumed: number } | null {
    if (buffer.length < 12) return null;
    const totalLen = readUInt32BE(buffer, 0);
    if (totalLen < 16 || totalLen > 16 * 1024 * 1024) {
        // Corrupt prelude — advance one byte so the caller resyncs.
        return { frame: null, consumed: 1 };
    }
    if (buffer.length < totalLen) return null;

    const headersLen = readUInt32BE(buffer, 4);
    const headersStart = 12;
    const payloadStart = headersStart + headersLen;
    const payloadEnd = totalLen - 4;
    if (payloadStart > payloadEnd || payloadEnd > totalLen) {
        return { frame: null, consumed: totalLen };
    }

    const headers = decodeHeaders(buffer.subarray(headersStart, payloadStart));
    const payload = buffer.subarray(payloadStart, payloadEnd);
    const frame = decodePayload(headers, payload);
    return { frame, consumed: totalLen };
}

function toSseChunk(event: string, data: string): string {
    return `event: ${event}\ndata: ${data}\n\n`;
}

/**
 * Transform a raw AWS eventstream byte stream into Anthropic-compatible SSE
 * bytes. Accumulates a rolling buffer until full frames are available, then
 * emits one `event:/data:` pair per decoded frame.
 */
export function createEventstreamToSseTransformer(): TransformStream<Uint8Array, Uint8Array> {
    let buffer = new Uint8Array(0);
    const encoder = new TextEncoder();

    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            const merged = new Uint8Array(buffer.length + chunk.length);
            merged.set(buffer, 0);
            merged.set(chunk, buffer.length);
            buffer = merged;

            while (buffer.length > 0) {
                const result = parseEventstreamFrame(buffer);
                if (!result) break;
                if (result.frame) {
                    controller.enqueue(
                        encoder.encode(toSseChunk(result.frame.event, result.frame.data))
                    );
                }
                buffer = buffer.subarray(result.consumed);
            }
        },
        flush() {
            buffer = new Uint8Array(0);
        },
    });
}
