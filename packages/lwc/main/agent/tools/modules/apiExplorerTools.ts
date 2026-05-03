/**
 * Agent tools backed by the API Explorer app.
 *
 * These tools are thin shims around the `api.*` commands registered by the
 * API Explorer app at bootstrap. They are NOT coupled to the app UI — the
 * `api.sendStandalone` command has no UI side effects, so the agent can
 * issue requests without disturbing the user's open tabs.
 */

import { hasCommand, invokeCommand } from 'host-api/commands';
import LOGGER from 'shared/logger';
import { z } from 'zod';

/**
 * Response body truncation threshold for agent output. Keeps the model's
 * context from being blown up by multi-MB Salesforce bulk responses.
 */
const MAX_BODY_BYTES = 50_000;

const HTTP_METHOD = z.enum([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
]);

const truncate = (
    body: unknown,
    contentLength: number | undefined
): { body: unknown; truncated: boolean } => {
    if (typeof body === 'string' && body.length > MAX_BODY_BYTES) {
        return {
            body: body.slice(0, MAX_BODY_BYTES),
            truncated: true,
        };
    }
    if (typeof body === 'object' && body !== null && (contentLength ?? 0) > MAX_BODY_BYTES) {
        try {
            const json = JSON.stringify(body);
            if (json.length > MAX_BODY_BYTES) {
                return {
                    body: json.slice(0, MAX_BODY_BYTES) + ' …[truncated]',
                    truncated: true,
                };
            }
        } catch {
            /* fall through */
        }
    }
    return { body, truncated: false };
};

export const apiExecuteRequestTool = {
    name: 'api_execute_request',
    description:
        'Execute an authenticated Salesforce REST/Tooling/Metadata/GraphQL API ' +
        'request via the API Explorer app. Accepts a relative path (e.g. ' +
        '"/services/data/v59.0/limits") against the current connected org, or ' +
        'an absolute URL. Headers auto-merge Bearer auth from the active ' +
        'connector unless an Authorization header is provided. Returns ' +
        '{status, headers, body, contentType, size, durationMs}. Large ' +
        'response bodies are truncated; check the `truncated` flag.',
    parameters: z.object({
        method: HTTP_METHOD,
        url: z
            .string()
            .describe(
                'Relative path (e.g. /services/data/v59.0/limits) or absolute URL.'
            ),
        headers: z
            .record(z.string())
            .optional()
            .describe('Additional request headers (e.g. Content-Type).'),
        body: z
            .string()
            .optional()
            .describe(
                'Raw request body (JSON-encoded string for JSON APIs, or raw XML/text).'
            ),
        variables: z
            .record(z.string())
            .optional()
            .describe(
                'Optional {key:value} map for `{key}` substitution in url/headers/body. Use `{sessionId}` to inject the connector access token.'
            ),
    }),
    execute: async (args: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: string;
        variables?: Record<string, string>;
    }) => {
        if (!hasCommand('api.sendStandalone')) {
            return {
                error:
                    'The API Explorer is not initialized yet. Navigate to the API app once to bootstrap it, or try again in a moment.',
            };
        }
        try {
            const result: any = await invokeCommand('api.sendStandalone', args);
            if (result?.error) return { error: result.error, aborted: result.aborted };
            const { body, truncated } = truncate(result?.body, result?.size);
            return {
                status: result?.status,
                headers: result?.headers,
                body,
                truncated,
                contentType: result?.contentType,
                size: result?.size,
                durationMs: result?.durationMs,
            };
        } catch (err) {
            LOGGER.error('[api_execute_request] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const apiOpenTabTool = {
    name: 'api_open_tab',
    description:
        'Open a new tab in the API Explorer app and optionally preload a request. ' +
        'Useful when you want to hand a prepared request back to the user for ' +
        'inspection or manual execution, instead of running it directly.',
    parameters: z.object({
        method: HTTP_METHOD.optional(),
        url: z.string().optional(),
        headers: z.record(z.string()).optional(),
        body: z.string().optional(),
    }),
    execute: async (args: {
        method?: string;
        url?: string;
        headers?: Record<string, string>;
        body?: string;
    }) => {
        if (!hasCommand('api.open')) {
            return { error: 'The API Explorer app does not expose api.open.' };
        }
        try {
            await invokeCommand('api.open', args);
            return { success: true };
        } catch (err) {
            LOGGER.error('[api_open_tab] Error:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    },
};

/** All API Explorer agent tools — add to Agent extraTools. */
export const apiExplorerTools = [apiExecuteRequestTool, apiOpenTabTool];
