import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { wire } from 'lwc';
import { AGENTS } from 'agentforce/slices';
import type {
    AgentforceStoreShape,
    TreeNode,
    TopicTreeNode,
    ActionTreeNode,
    ScriptTreeNode,
    TreeLabelSegment,
} from 'agentforce/slices/types';
import type {
    GenAiPlanner,
    GenAiPlugin,
    GenAiFunction,
    AgentScript,
} from 'agentforce/slices/agents';
import { search, type IndexedItem, type SearchResult } from './search/fuzzyMatch.ts';
import {
    deriveVariantFromError,
    type EmptyStateVariant,
} from 'agentforce/shared/emptyStates/emptyStates';

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_CAP = 50;
const REFRESH_DEBOUNCE_MS = 500;
const REFRESH_SHORT_CIRCUIT_MS = 2000;

function nodeClass(isSelected: boolean): string {
    return isSelected ? 'tree-node tree-node_selected' : 'tree-node';
}

type LabelSegment = TreeLabelSegment;

/**
 * Convert highlight ranges into a flat list of segments so LWC can render them
 * with a `for:each` over plain/marked spans (LWC has no innerHTML escape).
 */
function buildSegments(label: string, ranges?: Array<[number, number]>): LabelSegment[] {
    if (!ranges || ranges.length === 0) {
        return [{ key: 'plain-0', text: label, isMatch: false }];
    }
    const segs: LabelSegment[] = [];
    let cursor = 0;
    let segmentIndex = 0;
    for (const [start, end] of ranges) {
        if (start > cursor) {
            segs.push({
                key: `plain-${segmentIndex++}-${cursor}-${start}`,
                text: label.slice(cursor, start),
                isMatch: false,
            });
        }
        if (end > start) {
            segs.push({
                key: `match-${segmentIndex++}-${start}-${end}`,
                text: label.slice(start, end),
                isMatch: true,
            });
        }
        cursor = Math.max(cursor, end);
    }
    if (cursor < label.length) {
        segs.push({
            key: `plain-${segmentIndex}-${cursor}-${label.length}`,
            text: label.slice(cursor),
            isMatch: false,
        });
    }
    return segs;
}

export default class Inspector extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    agentScripts: AgentScript[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    loading = false;
    error: string | null = null;
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;
    selectedItemId: string | null = null;
    selectedItemType: string | null = null;
    expandedAgents: Set<string> = new Set();
    expandedTopics: Set<string> = new Set();
    searchQuery: string = '';

    private _hasFetchedAgents = false;
    private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    // N5 refresh-button state. Debounce prevents rapid double-clicks; the
    // 2-second short-circuit prevents spamming the network when the user
    // mashes the button.
    private _lastRefreshAt = 0;
    private _refreshDebounce: ReturnType<typeof setTimeout> | null = null;
    // Index memoization keys — only rebuild the flat index when the underlying
    // arrays change identity (Redux returns new refs on update).
    private _indexAgentsRef: GenAiPlanner[] | null = null;
    private _indexTopicsRef: GenAiPlugin[] | null = null;
    private _indexActionsRef: GenAiFunction[] | null = null;
    private _indexScriptsRef: AgentScript[] | null = null;
    private _cachedIndex: IndexedItem[] = [];

    connectedCallback() {
        this._loadAgents();
    }

    disconnectedCallback() {
        if (this._searchDebounceTimer !== null) {
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = null;
        }
        if (this._refreshDebounce !== null) {
            clearTimeout(this._refreshDebounce);
            this._refreshDebounce = null;
        }
    }

    /**
     * Refresh the inspector tree (agents + agent scripts). Disabled while
     * loading; debounced 500ms; short-circuits if last refresh < 2s ago.
     * `bypassCache: true` is plumbed through for future SWR support (F2).
     */
    handleRefresh() {
        if (this.loading) return;
        const now = Date.now();
        if (now - this._lastRefreshAt < REFRESH_SHORT_CIRCUIT_MS) return;
        if (this._refreshDebounce !== null) clearTimeout(this._refreshDebounce);
        this._refreshDebounce = setTimeout(() => {
            if (this.connector) {
                store.dispatch(
                    AGENTS.fetchAgents({ connector: this.connector, bypassCache: true })
                );
                store.dispatch(
                    AGENTS.fetchAgentScripts({ connector: this.connector, bypassCache: true })
                );
            }
            this._lastRefreshAt = Date.now();
            this._refreshDebounce = null;
        }, REFRESH_DEBOUNCE_MS);
    }

    private _loadAgents() {
        if (this._hasFetchedAgents) return;
        if (!this.connector) return;
        this._hasFetchedAgents = true;
        store.dispatch(AGENTS.fetchAgents({ connector: this.connector }));
        store.dispatch(AGENTS.fetchAgentScripts({ connector: this.connector }));
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: AgentforceStoreShape) {
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
            this.error = agentforce.error || null;
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
        }
    }

    get hasError(): boolean {
        // Only render the error empty-state when we have nothing useful to
        // show — Engineer 7's stale-vs-clear policy keeps stale agents on
        // rejection, in which case the user can still browse the previous
        // tree and the footer toast carries the error signal.
        return !!this.error && !this.hasAgents && !this.hasAgentScripts;
    }

    get errorVariant(): EmptyStateVariant {
        return deriveVariantFromError(this.error) || 'error';
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

    handleSearchInput(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        if (this._searchDebounceTimer !== null) {
            clearTimeout(this._searchDebounceTimer);
        }
        this._searchDebounceTimer = setTimeout(() => {
            this.searchQuery = value;
            this._searchDebounceTimer = null;
        }, SEARCH_DEBOUNCE_MS);
    }

    handleSearchClear() {
        if (this._searchDebounceTimer !== null) {
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = null;
        }
        this.searchQuery = '';
    }

    get hasAgents(): boolean {
        return this.agents.length > 0;
    }

    get hasAgentScripts(): boolean {
        return this.agentScripts.length > 0;
    }

    get isEmpty(): boolean {
        return !this.loading && !this.error && !this.hasAgents && !this.hasAgentScripts;
    }

    get hasSearchQuery(): boolean {
        return this.searchQuery.trim().length > 0;
    }

    get scriptTreeData(): ScriptTreeNode[] {
        const baseRows = this.agentScripts.map(script => ({
            fullName: script.fullName,
            label: script.fullName.replace(/_/g, ' '),
            lastModified: script.lastModifiedDate
                ? new Date(script.lastModifiedDate).toLocaleDateString()
                : '',
            isSelected: this.selectedItemId === script.fullName,
            nodeClass: nodeClass(this.selectedItemId === script.fullName),
        }));

        if (!this.hasSearchQuery) return baseRows;

        // When searching, restrict scripts to those whose label hits.
        const matched = this._filteredScriptIds();
        return baseRows.filter(r => matched.has(r.fullName));
    }

    private _filteredScriptIds(): Set<string> {
        const result = this._runSearch();
        const ids = new Set<string>();
        for (const item of result.items) {
            if (item.type === 'script') ids.add(item.id);
        }
        return ids;
    }

    /**
     * Build / return memoized flat index of all searchable nodes.
     * Rebuilt only when any of the source arrays change identity.
     */
    private _getIndex(): IndexedItem[] {
        if (
            this._indexAgentsRef === this.agents &&
            this._indexTopicsRef === this.topics &&
            this._indexActionsRef === this.actions &&
            this._indexScriptsRef === this.agentScripts
        ) {
            return this._cachedIndex;
        }
        const idx: IndexedItem[] = [];
        for (const a of this.agents) {
            idx.push({
                id: a.Id,
                label: a.MasterLabel,
                type: 'agent',
                parentId: null,
                devName: a.DeveloperName,
            });
        }
        for (const t of this.topics) {
            idx.push({
                id: t.Id,
                label: t.MasterLabel,
                type: 'topic',
                parentId: t.GenAiPlannerId,
                devName: t.DeveloperName,
            });
        }
        for (const ac of this.actions) {
            idx.push({
                id: ac.Id,
                label: ac.MasterLabel,
                type: 'action',
                parentId: ac.GenAiPluginId,
                devName: ac.DeveloperName,
            });
        }
        for (const s of this.agentScripts) {
            idx.push({
                id: s.fullName,
                label: s.fullName.replace(/_/g, ' '),
                type: 'script',
                parentId: null,
            });
        }
        this._indexAgentsRef = this.agents;
        this._indexTopicsRef = this.topics;
        this._indexActionsRef = this.actions;
        this._indexScriptsRef = this.agentScripts;
        this._cachedIndex = idx;
        return idx;
    }

    private _runSearch(): SearchResult {
        return search(this._getIndex(), this.searchQuery, { cap: SEARCH_CAP });
    }

    /**
     * Filtered tree. When `searchQuery` is empty, falls through to the full
     * tree. When non-empty, the result is reshaped so that any agent/topic
     * with a matched descendant remains visible (and is force-expanded so the
     * matched leaf is reachable).
     */
    get treeData(): TreeNode[] {
        if (!this.hasSearchQuery) {
            return this._fullTree();
        }
        return this._searchedTree();
    }

    get truncatedExtraCount(): number {
        if (!this.hasSearchQuery) return 0;
        const r = this._runSearch();
        return r.truncated ? r.totalMatched - r.items.length : 0;
    }

    get hasTruncatedResults(): boolean {
        return this.truncatedExtraCount > 0;
    }

    private _fullTree(): TreeNode[] {
        return this.agents.map(agent => {
            const isExpanded = this.expandedAgents.has(agent.Id);
            const agentTopics = this.topics.filter(t => t.GenAiPlannerId === agent.Id);
            const topicNodes: TopicTreeNode[] = isExpanded
                ? agentTopics.map(topic => {
                      const isTopicExpanded = this.expandedTopics.has(topic.Id);
                      const topicActions = this.actions.filter(a => a.GenAiPluginId === topic.Id);
                      const actionNodes: ActionTreeNode[] = isTopicExpanded
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
                          : [];
                      return {
                          id: topic.Id,
                          label: topic.MasterLabel,
                          type: 'topic',
                          isExpanded: isTopicExpanded,
                          isSelected: this.selectedItemId === topic.Id,
                          nodeClass: nodeClass(this.selectedItemId === topic.Id),
                          hasChildren: true,
                          children: actionNodes,
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

    /**
     * Search-mode tree: keep only matched nodes and their ancestors.
     * Force-expand parents of a matched descendant so the user sees the path.
     */
    private _searchedTree(): TreeNode[] {
        const result = this._runSearch();
        // Build lookup by id for matched items so we can read highlight ranges.
        const matchedById = new Map<string, IndexedItem>();
        for (const item of result.items) matchedById.set(item.id, item);

        // Determine which agent/topic ids must remain visible (because they
        // matched, or because a descendant matched).
        const visibleAgentIds = new Set<string>();
        const visibleTopicIds = new Set<string>();
        const visibleActionIds = new Set<string>();
        for (const item of result.items) {
            if (item.type === 'agent') visibleAgentIds.add(item.id);
            if (item.type === 'topic') {
                visibleTopicIds.add(item.id);
                if (item.parentId) visibleAgentIds.add(item.parentId);
            }
            if (item.type === 'action') {
                visibleActionIds.add(item.id);
                const topic = this.topics.find(t => t.Id === item.parentId);
                if (topic) {
                    visibleTopicIds.add(topic.Id);
                    visibleAgentIds.add(topic.GenAiPlannerId);
                }
            }
        }

        // Helper: build label segments — only when the node itself matched.
        const segsFor = (id: string, label: string): LabelSegment[] => {
            const m = matchedById.get(id);
            return buildSegments(label, m?.matchRanges);
        };

        return this.agents
            .filter(agent => visibleAgentIds.has(agent.Id))
            .map(agent => {
                const agentTopics = this.topics.filter(
                    t => t.GenAiPlannerId === agent.Id && visibleTopicIds.has(t.Id)
                );
                const topicNodes: TopicTreeNode[] = agentTopics.map(topic => {
                    const topicActions = this.actions.filter(
                        a =>
                            a.GenAiPluginId === topic.Id &&
                            (visibleActionIds.has(a.Id) || visibleTopicIds.has(topic.Id))
                    );
                    // If the topic itself matched (not an action), show its
                    // visible direct actions (could be empty if not yet
                    // fetched). If an action matched, only include matched ones.
                    const topicMatched = matchedById.has(topic.Id);
                    const filteredActions = topicMatched
                        ? topicActions
                        : topicActions.filter(a => visibleActionIds.has(a.Id));
                    const actionNodes: ActionTreeNode[] = filteredActions.map(action => ({
                        id: action.Id,
                        label: action.MasterLabel,
                        labelSegments: segsFor(action.Id, action.MasterLabel),
                        type: 'action',
                        isExpanded: false,
                        isSelected: this.selectedItemId === action.Id,
                        nodeClass: nodeClass(this.selectedItemId === action.Id),
                        hasChildren: false,
                        children: [],
                    }));
                    return {
                        id: topic.Id,
                        label: topic.MasterLabel,
                        labelSegments: segsFor(topic.Id, topic.MasterLabel),
                        type: 'topic',
                        // Force-expand any topic whose subtree has a hit.
                        isExpanded: true,
                        isSelected: this.selectedItemId === topic.Id,
                        nodeClass: nodeClass(this.selectedItemId === topic.Id),
                        hasChildren: actionNodes.length > 0,
                        children: actionNodes,
                    };
                });
                return {
                    id: agent.Id,
                    label: agent.MasterLabel,
                    labelSegments: segsFor(agent.Id, agent.MasterLabel),
                    type: 'agent',
                    isExpanded: true,
                    isSelected: this.selectedItemId === agent.Id,
                    nodeClass: nodeClass(this.selectedItemId === agent.Id),
                    hasChildren: topicNodes.length > 0,
                    children: topicNodes,
                };
            });
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
}
