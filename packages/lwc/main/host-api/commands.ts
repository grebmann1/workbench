/**
 * Host command registry.
 *
 * Extensions register named commands at mount (e.g. `soql.executeQuery`).
 * Callers in other parts of the host — electron launch intents, the agent
 * tool runtime — invoke them by id without importing the extension. If
 * the extension isn't loaded (not installed, not mounted yet, or disabled),
 * `invokeCommand` logs a warning and resolves to `undefined` instead of
 * crashing. This is the primitive that lets us detach SOQL (and other
 * apps) from core without creating hard load-order or missing-module
 * failures.
 *
 * Command ids are namespaced by their owning app: `<appId>.<verb>`
 * (e.g. `soql.executeQuery`). Handlers receive a single payload argument
 * — keep payloads serialisable when possible so command invocations can
 * later be proxied over IPC / window-message boundaries without change.
 *
 * ---
 *
 * # Typed payload contract — `CommandPayloads`
 *
 * `CommandPayloads` is the single source of truth for the shape of every
 * command's payload. New command ids added to the host MUST be appended
 * here so `invokeCommand`/`hasCommand` can validate their callers at
 * compile time.
 *
 * Backward compatibility: a fallback overload accepts arbitrary string
 * ids with `unknown` payloads, so existing untyped call sites still
 * compile. Typed ids opt in to the strong-typed signature automatically.
 */

/**
 * The four sub-views the Agentforce app exposes. Used by
 * `agentforce.openAgent` to land on a specific tab.
 */
export type AgentforceTab = 'inspector' | 'debugger' | 'dependencies' | 'editor';

/**
 * Tabs surfaced by the Jobs Monitor app. Mirrors `JobsTab` in
 * `applications/jobs/slices/jobs.ts`; duplicated here as a string-literal
 * union to keep `host-api/commands` from depending on an application
 * package.
 */
export type JobsTab = 'scheduled' | 'asyncApex' | 'flexQueue' | 'bulk';

/**
 * Minimal shape of a Salesforce REST API request as accepted by the
 * `api.executeRequest` command. Kept loose because the real request
 * builder lives in `shared/utils` and this module is part of the
 * host-api treaty — we don't want host-api importing application or
 * shared concrete request types.
 */
export interface ApiRequestLike {
    endpoint: string;
    method: string;
    body?: string;
    header?: string | Record<string, string>;
}

/**
 * Compile-time map of command id → payload shape.
 *
 * - Use `void` for commands that take no payload.
 * - Use a precise interface for commands whose handler reads named
 *   fields off the payload.
 * - Use `unknown` (with a `// TYPE-DEBT` comment) only for genuinely
 *   opaque payloads where the handler's contract is not yet pinned
 *   down. Never use `any`.
 *
 * To add a new typed command: register the handler at its app's
 * bootstrap, then append the id here with the matching payload type.
 * Forgetting the second step is intentional friction — it means the
 * id is not part of the host treaty yet.
 */
export interface CommandPayloads {
    // ── agentforce ──────────────────────────────────────────────
    'agentforce.open': void;
    // The two openAgent / openTrace ids below are not yet registered
    // (they land in the H1 N7 / N9 work). They're declared up-front so
    // the agent-tool surface (N1b) and electron launch intents can be
    // typed against them as soon as the registrations land.
    // Either `agentId` (typed Salesforce Id, validated via `asSalesforceId`)
    // or `name` (label / DeveloperName, fuzzy-matched against state.agents).
    // Precedence: `agentId` wins over `name` when both are supplied. Both
    // forms are accepted so the slash command (`/af-agent <name>`) and
    // electron launch intents (id-based) can share the same command id.
    // `query` is the raw arg string forwarded by the slash dispatcher when
    // the user types `/af-agent <name>`; the handler treats it as `name`
    // when the typed fields are absent.
    'agentforce.openAgent': {
        agentId?: string;
        name?: string;
        tab?: AgentforceTab;
        query?: string;
    };
    'agentforce.openTrace': {
        conversationId?: string;
        stepId?: string;
        query?: string;
    };
    'agentforce.openTopic': { agentId: string; topicId: string };

    // ── soql ────────────────────────────────────────────────────
    'soql.open': void;
    'soql.hasTab': { tabId: string };
    'soql.selectTab': { tabId: string };
    'soql.openOrSelectTab': { tabId: string; isNewTab: boolean; body: string };
    // TYPE-DEBT: handler reads connector/soql/rawSoql/tabId/useToolingApi/
    // includeDeletedRecords off `payload: any`. Pinning the connector
    // shape requires `host-api/connector` types to stabilise first.
    'soql.executeQuery': {
        connector: unknown;
        soql: string;
        rawSoql?: string;
        tabId?: string;
        sobjectName?: string;
        isAllRows?: boolean;
        useToolingApi?: boolean;
        includeDeletedRecords?: boolean;
        createdDate?: number;
    };
    'soql.executeQueryIncognito': {
        connector: unknown;
        soql: string;
        tabId?: string;
        useToolingApi?: boolean;
        includeDeletedRecords?: boolean;
    };

    // ── api ─────────────────────────────────────────────────────
    'api.executeRequest': {
        connector: unknown;
        request: ApiRequestLike;
        formattedRequest?: ApiRequestLike;
        tabId?: string;
        isNewTab?: boolean;
        tab?: unknown;
        createdDate?: number;
    };

    // ── anonymousApex ───────────────────────────────────────────
    'anonymousApex.executeApex': {
        connector: unknown;
        body: string;
        tabId?: string;
        isNewTab?: boolean;
        createdDate?: number;
    };
    'anonymousApex.executeApexIncognito': {
        connector: unknown;
        body: string;
    };

    // ── auditTrail ──────────────────────────────────────────────
    'auditTrail.open': void;

    // ── jobs ────────────────────────────────────────────────────
    'jobs.open': void;
    'jobs.refresh': { tab?: JobsTab } | void;
    'jobs.abort': { id?: string; kind?: 'scheduled' | 'bulk' } | void;

    // ── graphql ─────────────────────────────────────────────────
    'graphql.open': void;
    'graphql.shortcuts': void;

    // ── recordviewer ────────────────────────────────────────────
    // Not yet registered as a command; reserved for the H1 work that
    // teaches recordviewer to receive an explicit recordId payload.
    'recordviewer.open': { recordId: string };
}

/** All known typed command ids. */
export type CommandId = keyof CommandPayloads;

/** Command ids whose payload is `void` (no argument). */
export type VoidCommandId = {
    [K in CommandId]: CommandPayloads[K] extends void ? K : never;
}[CommandId];

/** Command ids whose payload is non-`void` (one required argument). */
export type PayloadCommandId = Exclude<CommandId, VoidCommandId>;

/**
 * Handler signature for a typed command. Mirrors how handlers are
 * actually written today: a single payload arg, return value passed
 * through to `invokeCommand`'s caller.
 */
export type CommandHandler<K extends CommandId> = CommandPayloads[K] extends void
    ? () => unknown | Promise<unknown>
    : (payload: CommandPayloads[K]) => unknown | Promise<unknown>;

type AnyHandler = (payload?: unknown) => unknown | Promise<unknown>;
type Unregister = () => void;

/**
 * Handler argument type for `registerCommand`. Like `InvokeCommandArgs`,
 * a single conditional signature avoids overload-resolution fall-through
 * under `strict: false`.
 */
export type RegisterCommandHandler<K extends string> = K extends CommandId
    ? CommandHandler<K>
    : AnyHandler;

/**
 * Invoke a command. Returns whatever the handler returns, or `undefined`
 * if no handler is registered. Callers that need to distinguish
 * "command missing" from "command returned undefined" should use
 * `hasCommand` first.
 *
 * Errors thrown by the handler propagate — the registry is not a
 * try/catch wrapper. If you need a "fire and forget" call, discard the
 * promise explicitly at the call site.
 *
 * Two overloads:
 *  1. Typed — `id` is a key of `CommandPayloads`; `payload` is checked.
 *  2. Untyped fallback — preserves backward compatibility for legacy
 *     untyped call sites that pass an arbitrary string id.
 */
/**
 * Argument tuple for `invokeCommand`. A single generic signature using a
 * conditional-rest tuple is preferred over multiple overloads here:
 * overload resolution silently falls through to the loosest matching
 * signature, which would let a wrong-shape payload compile under
 * `strict: false`. With one signature TS reports the precise mismatch
 * at the actual call site.
 *
 *   - Known void id  → `[K]` (no payload required).
 *   - Known payload id → `[K, CommandPayloads[K]]`.
 *   - Unknown / arbitrary string id → `[K, unknown?]` (legacy untyped
 *     call sites still compile).
 */
export type InvokeCommandArgs<K extends string> = K extends CommandId
    ? CommandPayloads[K] extends void
        ? [id: K] | [id: K, payload?: undefined]
        : [id: K, payload: CommandPayloads[K]]
    : [id: K, payload?: unknown];

export interface RegisterCommandFn {
    <K extends string>(id: K, handler: RegisterCommandHandler<K>): Unregister;
}

export interface HasCommandFn {
    <K extends CommandId>(id: K): boolean;
    (id: string): boolean;
}

export interface InvokeCommandFn {
    <K extends string>(...args: InvokeCommandArgs<K>): Promise<unknown>;
}

import {
    registerCommand as registerCommandRuntime,
    hasCommand as hasCommandRuntime,
    invokeCommand as invokeCommandRuntime,
    __resetCommandsForTests as resetCommandsForTestsRuntime,
} from './commands.js';

export const registerCommand = registerCommandRuntime as RegisterCommandFn;
export const hasCommand = hasCommandRuntime as HasCommandFn;
export const invokeCommand = invokeCommandRuntime as InvokeCommandFn;

/**
 * Test-only: drop all registrations. Not exported from the public barrel.
 */
export const __resetCommandsForTests = resetCommandsForTestsRuntime as () => void;
