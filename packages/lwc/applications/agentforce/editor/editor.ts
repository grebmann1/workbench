import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { AGENTSCRIPT } from 'editor/languages';
import { wire } from 'lwc';

import type { GenAiPlanner, GenAiPlugin, GenAiFunction } from 'agentforce/slices/agents';

export default class Editor extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;

    currentModel: any = null;

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
        }

        this.updateEditorContent();
    }

    get hasSelection(): boolean {
        return this.selectedAgentId !== null;
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
        const editorRef = this.refs.editor as any;
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
