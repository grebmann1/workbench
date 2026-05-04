import { normalizeLlmProvider } from 'shared/llm';
import { normalizeBaseUrl, getModelFromRequestBody, type FormattedRequest } from '../shared/fetch';
import { createEventstreamToSseTransformer } from './eventstream';

export function isAnthropicBedrockGateway(provider: unknown, baseUrl: unknown) {
    return (
        normalizeLlmProvider(provider) === 'anthropic' &&
        normalizeBaseUrl(baseUrl).endsWith('/bedrock')
    );
}

function isStreamingBody(body: BodyInit | null | undefined): boolean {
    if (typeof body !== 'string') return false;
    try {
        const payload = JSON.parse(body);
        return payload?.stream === true;
    } catch {
        return false;
    }
}

function toAnthropicBedrockBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
    if (typeof body !== 'string') {
        return body;
    }
    try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== 'object') {
            return body;
        }
        const { model: _model, stream: _stream, ...bedrockPayload } = payload;
        return JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            ...bedrockPayload,
        });
    } catch {
        return body;
    }
}

export async function toAnthropicBedrockResponse(response: Response): Promise<Response> {
    const contentType = response.headers.get('content-type') || '';

    // Non-streaming `/invoke` returns clean JSON — the Anthropic SDK reads it
    // directly, and any SSE passthrough from the gateway also bypasses us.
    if (contentType.includes('text/event-stream') || contentType.includes('application/json')) {
        return response;
    }

    // Everything else coming back from a streaming Bedrock request is AWS
    // eventstream framing. The gateway frequently omits the content-type
    // header for this payload, so we treat "not JSON / not SSE" as eventstream
    // and pipe the body through the decoder to preserve incremental delivery.
    if (!response.ok || !response.body) {
        return response;
    }
    const sseStream = response.body.pipeThrough(createEventstreamToSseTransformer());
    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/event-stream');
    headers.delete('content-length');
    return new Response(sseStream, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export function toAnthropicBedrockRequest(
    url: RequestInfo | URL,
    options?: RequestInit
): FormattedRequest {
    const urlObj = new URL(url.toString());
    const streaming = isStreamingBody(options?.body);
    const streamingEndpoint = 'invoke-with-response-stream';
    const invokeEndpoint = 'invoke';
    const targetEndpoint = streaming ? streamingEndpoint : invokeEndpoint;
    const nextOptions = {
        ...options,
        body: toAnthropicBedrockBody(options?.body),
    };

    if (urlObj.pathname.includes('/bedrock/model/')) {
        urlObj.pathname = urlObj.pathname.replace(/\/messages$/, `/${targetEndpoint}`);
        return { url: urlObj.toString(), options: nextOptions };
    }

    const bedrockPrefix = '/bedrock/';
    const bedrockIndex = urlObj.pathname.indexOf(bedrockPrefix);
    const model = getModelFromRequestBody(options?.body);
    if (bedrockIndex === -1 || !model) {
        return { url: urlObj.toString(), options: nextOptions };
    }

    const prefix = urlObj.pathname.slice(0, bedrockIndex);
    const endpoint = urlObj.pathname
        .slice(bedrockIndex + bedrockPrefix.length)
        .replace(/^messages$/, targetEndpoint);
    urlObj.pathname = `${prefix}/bedrock/model/${model}/${endpoint}`;
    return { url: urlObj.toString(), options: nextOptions };
}
