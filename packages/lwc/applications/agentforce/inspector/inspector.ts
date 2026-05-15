import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { wire } from 'lwc';
import { AGENTS } from 'agentforce/slices';

function nodeClass(isSelected: boolean): string {
    return isSelected ? 'tree-node tree-node_selected' : 'tree-node';
}

export default class Inspector extends ToolkitElement {
    agents: any[] = [];
    agentScripts: any[] = [];
    topics: any[] = [];
    actions: any[] = [];
    loading = false;
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;
    selectedItemId: string | null = null;
    selectedItemType: string | null = null;
    expandedAgents: Set<string> = new Set();
    expandedTopics: Set<string> = new Set();
    private _hasFetchedAgents = false;

    connectedCallback() {
        this._loadAgents();
    }

    private _loadAgents() {
        if (this._hasFetchedAgents) return;
        if (!this.connector) return;
        this._hasFetchedAgents = true;
        store.dispatch(AGENTS.fetchAgents({ connector: this.connector }));
        store.dispatch(AGENTS.fetchAgentScripts({ connector: this.connector }));
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (!this._hasFetchedAgents && this.connector) {
            this._loadAgents();
        }

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.agentScripts = agentforce.agentScripts || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.loading = agentforce.loading || false;
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
        }
    }

    handleAgentClick(event: Event) {
        const target = event.currentTarget as HTMLElement;
        const agentId = target.dataset.id;
        if (!agentId) return;

        store.dispatch(AGENTS.reduxSlice.actions.selectAgent({ agentId }));

        if (this.expandedAgents.has(agentId)) {
            this.expandedAgents.delete(agentId);
            this.expandedAgents = new Set(this.expandedAgents);
        } else {
            this.expandedAgents.add(agentId);
            this.expandedAgents = new Set(this.expandedAgents);
            store.dispatch(
                AGENTS.fetchTopics({
                    connector: this.connector,
                    agentId,
                })
            );
        }

        this.selectedItemId = agentId;
        this.selectedItemType = 'agent';
    }

    handleTopicClick(event: Event) {
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement;
        const topicId = target.dataset.id;
        if (!topicId) return;

        store.dispatch(AGENTS.reduxSlice.actions.selectTopic({ topicId }));

        if (this.expandedTopics.has(topicId)) {
            this.expandedTopics.delete(topicId);
            this.expandedTopics = new Set(this.expandedTopics);
        } else {
            this.expandedTopics.add(topicId);
            this.expandedTopics = new Set(this.expandedTopics);
            store.dispatch(
                AGENTS.fetchActions({
                    connector: this.connector,
                    topicId,
                })
            );
        }

        this.selectedItemId = topicId;
        this.selectedItemType = 'topic';
    }

    handleActionClick(event: Event) {
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement;
        const actionId = target.dataset.id;
        if (!actionId) return;

        this.selectedItemId = actionId;
        this.selectedItemType = 'action';

        this.dispatchEvent(
            new CustomEvent('itemselect', {
                detail: { id: actionId, type: 'action' },
            })
        );
    }

    get hasAgents(): boolean {
        return this.agents.length > 0;
    }

    get hasAgentScripts(): boolean {
        return this.agentScripts.length > 0;
    }

    get isEmpty(): boolean {
        return !this.loading && !this.hasAgents && !this.hasAgentScripts;
    }

    get scriptTreeData(): any[] {
        return this.agentScripts.map(script => ({
            fullName: script.fullName,
            label: script.fullName.replace(/_/g, ' '),
            lastModified: script.lastModifiedDate
                ? new Date(script.lastModifiedDate).toLocaleDateString()
                : '',
            isSelected: this.selectedItemId === script.fullName,
            nodeClass: nodeClass(this.selectedItemId === script.fullName),
        }));
    }

    handleScriptClick(event: Event) {
        const target = event.currentTarget as HTMLElement;
        const scriptId = target.dataset.id;
        if (!scriptId) return;
        this.selectedItemId = scriptId;
        this.selectedItemType = 'script';
        store.dispatch(
            AGENTS.fetchAgentScriptContent({ connector: this.connector, fullName: scriptId })
        );
    }

    get treeData(): any[] {
        return this.agents.map(agent => {
            const isExpanded = this.expandedAgents.has(agent.Id);
            const agentTopics = this.topics.filter((t: any) => t.GenAiPlannerId === agent.Id);
            const topicNodes = isExpanded
                ? agentTopics.map(topic => {
                      const isTopicExpanded = this.expandedTopics.has(topic.Id);
                      const topicActions = this.actions.filter(
                          (a: any) => a.GenAiPluginId === topic.Id
                      );
                      return {
                          id: topic.Id,
                          label: topic.MasterLabel,
                          type: 'topic',
                          isExpanded: isTopicExpanded,
                          isSelected: this.selectedItemId === topic.Id,
                          nodeClass: nodeClass(this.selectedItemId === topic.Id),
                          hasChildren: true,
                          children: isTopicExpanded
                              ? topicActions.map(action => ({
                                    id: action.Id,
                                    label: action.MasterLabel,
                                    type: 'action',
                                    isExpanded: false,
                                    isSelected: this.selectedItemId === action.Id,
                                    nodeClass: nodeClass(this.selectedItemId === action.Id),
                                    hasChildren: false,
                                    children: [],
                                }))
                              : [],
                      };
                  })
                : [];

            return {
                id: agent.Id,
                label: agent.MasterLabel,
                type: 'agent',
                isExpanded,
                isSelected: this.selectedItemId === agent.Id,
                nodeClass: nodeClass(this.selectedItemId === agent.Id),
                hasChildren: true,
                children: topicNodes,
            };
        });
    }
}
