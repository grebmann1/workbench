import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { AGENTSCRIPT } from 'editor/languages';
import { wire } from 'lwc';
import type { editor as MonacoEditor } from 'monaco-editor';

import { AGENTS } from 'agentforce/slices';
import {
    deriveVariantFromError,
    type EmptyStateVariant,
} from 'agentforce/shared/emptyStates/emptyStates';
import type {
    GenAiPlanner,
    GenAiPlugin,
    GenAiFunction,
    AgentScriptContent,
} from 'agentforce/slices/agents';
import type { AgentforceStoreShape, EditorElementRef } from 'agentforce/slices/types';

const REFRESH_DEBOUNCE_MS = 500;
const REFRESH_SHORT_CIRCUIT_MS = 2000;

export default class Editor extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;
    selectedScriptContent: AgentScriptContent | null = null;
    scriptContentLoading = false;
    loading = false;
    error: string | null = null;

    currentModel: MonacoEditor.ITextModel | null = null;

    // N5 refresh-button state. Re-fetches selected script content (if any).
    private _lastRefreshAt = 0;
    private _refreshDebounce: ReturnType<typeof setTimeout> | null = null;

    disconnectedCallback() {
        if (this._refreshDebounce !== null) {
            clearTimeout(this._refreshDebounce);
            this._refreshDebounce = null;
        }
    }

    /**
     * Refresh: re-fetch the currently selected script content (if any). The
     * editor view derives the rest of its content from already-loaded
     * agents/topics/actions slices, so refreshing those is the inspector's
     * job. Disabled while loading; debounced 500ms; 2s short-circuit.
     * `bypassCache: true` plumbed for F2.
     */
    handleRefresh() {
        if (this.loading || this.scriptContentLoading) return;
        const fullName = this.selectedScriptContent?.fullName;
        if (!fullName) return;
        const now = Date.now();
        if (now - this._lastRefreshAt < REFRESH_SHORT_CIRCUIT_MS) return;
        if (this._refreshDebounce !== null) clearTimeout(this._refreshDebounce);
        this._refreshDebounce = setTimeout(() => {
            if (this.connector && fullName) {
                store.dispatch(
                    AGENTS.fetchAgentScriptContent({
                        connector: this.connector,
                        fullName,
                        bypassCache: true,
                    })
                );
            }
            this._lastRefreshAt = Date.now();
            this._refreshDebounce = null;
        }, REFRESH_DEBOUNCE_MS);
    }

    get isRefreshDisabled(): boolean {
        return this.loading || this.scriptContentLoading || !this.selectedScriptContent;
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: AgentforceStoreShape) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
            this.selectedScriptContent = agentforce.selectedScriptContent || null;
            this.scriptContentLoading = agentforce.scriptContentLoading || false;
            this.loading = agentforce.loading || false;
            this.error = agentforce.error || null;
        }

        this.updateEditorContent();
    }

    get hasSelection(): boolean {
        return this.selectedAgentId !== null;
    }

    /**
     * Render the error empty-state when a script load failed and we have
     * nothing useful to display in Monaco.
     */
    get hasScriptError(): boolean {
        return !!this.error && !this.scriptContentLoading && !this.selectedScriptContent;
    }

    get errorVariant(): EmptyStateVariant {
        return deriveVariantFromError(this.error) || 'error';
    }

    get editorContent(): string {
        if (!this.selectedAgentId) return '';

        const agent = this.agents.find(a => a.Id === this.selectedAgentId);
        if (!agent) return '';

        const agentTopics = this.topics.filter(t => t.GenAiPlannerId === agent.Id);
        const lines: string[] = [];

        lines.push(`# Agent: ${agent.MasterLabel}`);
        lines.push('');
        lines.push('start_agent');
        lines.push(`  set name = "${agent.MasterLabel}"`);
        lines.push(`  set developer_name = "${agent.DeveloperName}"`);
        if (agent.Description) {
            lines.push(`  set description = "${agent.Description}"`);
        }
        lines.push('end');
        lines.push('');

        for (const topic of agentTopics) {
            lines.push(`topic "${topic.MasterLabel}"`);
            lines.push(`  set developer_name = "${topic.DeveloperName}"`);
            if (topic.Description) {
                lines.push(`  set description = "${topic.Description}"`);
            }

            const topicActions = this.actions.filter(a => a.GenAiPluginId === topic.Id);
            for (const action of topicActions) {
                lines.push('');
                lines.push(`  action "${action.MasterLabel}"`);
                lines.push(`    set developer_name = "${action.DeveloperName}"`);
                if (action.ActionType) {
                    lines.push(`    set type = "${action.ActionType}"`);
                }
                if (action.FlowDefinitionId) {
                    lines.push(`    run flow "${action.FlowDefinitionId}"`);
                }
                lines.push('  end');
            }

            lines.push('end');
            lines.push('');
        }

        return lines.join('\n');
    }

    handleMonacoLoaded = () => {
        const editorRef = this.refs.editor as unknown as EditorElementRef | undefined;
        if (!editorRef) return;

        const monaco = editorRef.currentMonaco;
        if (!monaco) return;

        AGENTSCRIPT.configureAgentScriptLanguage(monaco);
        this.currentModel = editorRef.createModel({
            body: this.editorContent,
            language: 'agentscript',
        });
        editorRef.displayModel(this.currentModel);
    };

    updateEditorContent() {
        if (this.currentModel) {
            const content = this.editorContent;
            if (this.currentModel.getValue() !== content) {
                this.currentModel.setValue(content);
            }
        }
    }
}
