/**
 * App-local store shape and view-model contracts for the Agentforce app.
 *
 * Boundary: these types are app-private. Do NOT promote to `host-api/types`.
 * Apps subscribe to a subset of the global store via `storeChange`; this file
 * declares the slice subset the agentforce app actually reads.
 *
 * The `application` portion is intentionally narrow — only the fields the
 * agentforce components access on store updates (`currentApplication` and
 * `connector`). Widening it would couple the app to internal core state.
 */
import type { ConnectorLike } from 'host-api/connector';
import type { AgentforceState, GenAiPlanner, GenAiPlugin, GenAiFunction } from './agents';
import type { DebuggerState } from './debugger';

export type { AgentforceState } from './agents';
export type { DebuggerState } from './debugger';

/**
 * Subset of the global Redux state visible to agentforce components.
 *
 * Mirrors the destructuring pattern used in every `storeChange` callback:
 *   `storeChange({ agentforce, agentforceDebugger, application })`.
 */
export interface AgentforceStoreShape {
    agentforce: AgentforceState;
    agentforceDebugger: DebuggerState;
    application: {
        currentApplication: string | null;
        connector: ConnectorLike | null;
    };
}

// ---------------------------------------------------------------------------
// Inspector tree-view nodes
// ---------------------------------------------------------------------------

/**
 * Label split into plain/marked segments for highlighted rendering.
 * Computed once per search result and cached on the tree node so the LWC
 * template never recomputes ranges per render.
 */
export interface TreeLabelSegment {
    key: string;
    text: string;
    isMatch: boolean;
}

interface BaseTreeNode {
    id: string;
    label: string;
    /**
     * Optional pre-split segments for the inspector's type-ahead search.
     * Absent in the unfiltered tree (no highlights to render).
     */
    labelSegments?: TreeLabelSegment[];
    isExpanded: boolean;
    isSelected: boolean;
    nodeClass: string;
    hasChildren: boolean;
}

export interface AgentTreeNode extends BaseTreeNode {
    type: 'agent';
    children: TopicTreeNode[];
}

export interface TopicTreeNode extends BaseTreeNode {
    type: 'topic';
    children: ActionTreeNode[];
}

export interface ActionTreeNode extends BaseTreeNode {
    type: 'action';
    children: never[];
}

export type TreeNode = AgentTreeNode | TopicTreeNode | ActionTreeNode;

/** Lightweight script-tree row (different shape than {@link TreeNode}). */
export interface ScriptTreeNode {
    fullName: string;
    label: string;
    lastModified: string;
    isSelected: boolean;
    nodeClass: string;
}

// ---------------------------------------------------------------------------
// LLM step input / output
//
// Derived from the runtime parsing in llmDetail.ts. The actual GenAiInteractionStep
// payloads come from Salesforce as JSON strings — these interfaces describe the
// shape the component reads after `JSON.parse` succeeds. All fields are optional
// because the underlying payload schema is not stable across releases.
// ---------------------------------------------------------------------------

export interface LlmStepMessage {
    role?: string;
    content?: string | unknown;
}

export interface LlmStepInput {
    model?: string;
    messages?: LlmStepMessage[];
}

export interface LlmStepToolCall {
    name?: string;
    arguments?: Record<string, unknown>;
}

export interface LlmStepTokenUsage {
    total?: number;
    prompt?: number;
    completion?: number;
}

export interface LlmStepOutput {
    finishReason?: string;
    response?: string;
    content?: string;
    tokensUsed?: LlmStepTokenUsage;
    toolCalls?: LlmStepToolCall[];
}

// ---------------------------------------------------------------------------
// Editor host-component ref
//
// The agentforce `editor` LWC delegates to the host's `editor/default` element,
// which exposes a small surface (`currentMonaco`, `createModel`, `displayModel`).
// We type only what we use; the underlying element is implemented in JS.
// ---------------------------------------------------------------------------

export interface EditorElementRef {
    currentMonaco?: typeof import('monaco-editor');
    createModel: (opts: {
        body: string;
        language: string;
    }) => import('monaco-editor').editor.ITextModel;
    displayModel: (model: import('monaco-editor').editor.ITextModel) => void;
}

// Re-exports to minimize imports for consumers — single import path.
export type { GenAiPlanner, GenAiPlugin, GenAiFunction };
