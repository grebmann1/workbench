import { store, APPLICATION, connectStore } from 'core/store';
import { invokeCommand } from 'host-api/commands';
import {
    formatMcpServersJson,
    normalizeMcpServerConfigs,
    parseMcpServersJson,
} from '../../../main/agent/mcp/mcpJsonParser';
import Toast from 'lightning/toast';
import { LightningElement, track, wire } from 'lwc';
import {
    buildProviderConfigCacheRecord,
    cacheManager,
    CACHE_CONFIG,
    getAiProviderFromConfig,
    getLlmProviderConfigCacheKeys,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import { fetchSubscriptionModels } from 'shared/llm';
import { CHAT_APPROVAL_MODE_KEY } from './constants';

function buildEditableProviderConfigs(config) {
    const currentProviderConfigs = resolveLlmProviderConfigMap(config);
    return {
        ...currentProviderConfigs,
        openai: {
            ...currentProviderConfigs.openai,
            apiKey: config[CACHE_CONFIG.OPENAI_KEY.key],
            baseUrl: config[CACHE_CONFIG.OPENAI_URL.key],
        },
        anthropic: {
            ...currentProviderConfigs.anthropic,
            apiKey: config[CACHE_CONFIG.ANTHROPIC_KEY.key],
            baseUrl: config[CACHE_CONFIG.ANTHROPIC_URL.key],
        },
        gemini: {
            ...currentProviderConfigs.gemini,
            apiKey: config[CACHE_CONFIG.GEMINI_KEY.key],
            baseUrl: config[CACHE_CONFIG.GEMINI_URL.key],
        },
        mistral: {
            ...currentProviderConfigs.mistral,
            apiKey: config[CACHE_CONFIG.MISTRAL_KEY.key],
            baseUrl: config[CACHE_CONFIG.MISTRAL_URL.key],
        },
        grok: {
            ...currentProviderConfigs.grok,
            apiKey: config[CACHE_CONFIG.GROK_KEY.key],
            baseUrl: config[CACHE_CONFIG.GROK_URL.key],
        },
    };
}

export default class Chat extends LightningElement {
    @track yoloMode = false;
    @track approvalModeLoaded = false;
    @track isSavingApprovalMode = false;
    @track isSettingsViewOpen = false;
    @track config = {};
    @track originalConfig = {};
    @track mcpDraft = '';
    @track mcpError = '';
    @track browserTabs: Array<{ id: number; title: string; url: string; active: boolean }> = [];
    @track browserTabId: number | undefined;
    @track browserError = '';
    @track activity = '';
    @track activityStatus = '';
    @track isAgentRunning = false;
    @track isWaitingForApproval = false;
    @track isTabPickerOpen = false;
    @track tabSearch = '';
    private refreshSequence = 0;
    private refreshTimer: ReturnType<typeof setInterval> | undefined;

    @wire(connectStore, { store })
    storeChange({ agent }) {
        this.isAgentRunning = Object.values(agent?.runStateById || {}).some(
            (run: { running?: boolean }) => run.running
        );
        if (this.isAgentRunning && this.isTabPickerOpen) this.handleCloseTabPicker();
        if (!this.isAgentRunning) this.isWaitingForApproval = false;
    }

    connectedCallback() {
        void this.loadApprovalMode();
        void this.refreshTabs();
        // Poll metadata only; no page content is read until the user sends a prompt.
        this.refreshTimer = setInterval(() => void this.refreshTabs(), 2500);
        window.addEventListener('workbench:browser-activity', this.handleBrowserActivity);
        window.addEventListener('agent:ask_user', this.handleQuestionOpen);
        window.addEventListener('agent:question_closed', this.handleQuestionClosed);
        chrome.runtime.onMessage.addListener(this.handleProviderOAuthResult);
    }

    async loadApprovalMode() {
        try {
            const saved = await chrome.storage.local.get(CHAT_APPROVAL_MODE_KEY);
            this.yoloMode = saved[CHAT_APPROVAL_MODE_KEY] === 'yolo';
        } catch {
            this.yoloMode = false;
        } finally {
            this.approvalModeLoaded = true;
        }
    }

    get isApprovalModeDisabled() {
        return !this.approvalModeLoaded || this.isSavingApprovalMode || this.isAgentRunning;
    }

    get approvalModeClass() {
        return `approval-mode${this.yoloMode ? ' approval-mode_yolo' : ''}`;
    }

    get approvalModeLabel() {
        return this.yoloMode ? 'YOLO on' : 'YOLO off';
    }

    get approvalModeHint() {
        if (this.isAgentRunning) return 'Stop the active run before changing approval mode.';
        return this.yoloMode
            ? 'YOLO: browser actions, Bash, and connected tools run without approval. Applies to new requests.'
            : 'Ask first: browser actions, Bash, and connected tools ask for approval. Click to enable YOLO.';
    }

    get approvalSummary() {
        return this.yoloMode ? 'YOLO · Tools run without approval' : 'Actions ask for approval';
    }

    get approvalIcon() {
        return this.yoloMode ? 'zap' : 'shield-check';
    }

    handleToggleYolo = async () => {
        if (this.isApprovalModeDisabled) return;
        this.yoloMode = !this.yoloMode;
        this.isSavingApprovalMode = true;
        try {
            await chrome.storage.local.set({
                [CHAT_APPROVAL_MODE_KEY]: this.yoloMode ? 'yolo' : 'ask',
            });
        } catch {
            Toast.show({
                label: 'Mode changed for this panel, but the preference could not be saved.',
                variant: 'error',
            });
        } finally {
            this.isSavingApprovalMode = false;
        }
    };

    disconnectedCallback() {
        clearInterval(this.refreshTimer);
        this.refreshSequence++;
        window.removeEventListener('workbench:browser-activity', this.handleBrowserActivity);
        window.removeEventListener('agent:ask_user', this.handleQuestionOpen);
        window.removeEventListener('agent:question_closed', this.handleQuestionClosed);
        chrome.runtime.onMessage.removeListener(this.handleProviderOAuthResult);
    }

    handleProviderOAuthResult = message => {
        // The settings component handles results while visible. Keep login completion working
        // if the user returns to chat before finishing in the provider popup.
        if (message?.action !== 'workbench_oauth_result' || this.isSettingsViewOpen) return;
        if (!message.ok) {
            Toast.show({ label: message.message || 'Sign-in failed.', variant: 'error' });
            return;
        }
        void this.refreshSignedInProvider().catch(() =>
            Toast.show({ label: 'Signed in. Reopen the panel to refresh models.', variant: 'info' })
        );
    };

    async refreshSignedInProvider() {
        const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
        const providerConfigs = resolveLlmProviderConfigMap(cached);
        store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
        const models = await fetchSubscriptionModels(providerConfigs);
        store.dispatch(APPLICATION.reduxSlice.actions.updateSubscriptionModels({ models }));
        Toast.show({ label: 'Signed in.', variant: 'success' });
    }

    renderedCallback() {
        const editor = this.template.querySelector('textarea');
        if (editor && editor.value !== this.mcpDraft) editor.value = this.mcpDraft;
        const picker = this.tabPicker;
        if (this.isTabPickerOpen && picker && !picker.open) {
            picker.showModal();
            picker.querySelector<HTMLInputElement>('input')?.focus();
        }
    }

    refreshTabs = async () => {
        const sequence = ++this.refreshSequence;
        try {
            const tabs = await invokeCommand('chat.browserTabs');
            if (sequence !== this.refreshSequence) return;
            this.browserTabs = Array.isArray(tabs) ? tabs : [];
            // Select once. A closed target stays unavailable until the user chooses another.
            if (this.browserTabId === undefined && !this.isAgentRunning) {
                this.browserTabId = (
                    this.browserTabs.find(tab => tab.active) || this.browserTabs[0]
                )?.id;
            }
            this.browserError = '';
        } catch (error) {
            if (sequence !== this.refreshSequence) return;
            this.browserError =
                error instanceof Error ? error.message : 'Could not read browser tabs.';
        }
    };

    handleBrowserActivity = (event: CustomEvent) => {
        if (event.detail.tabId !== this.browserTabId) return;
        this.activity = event.detail.error || event.detail.description;
        this.activityStatus = event.detail.status;
    };

    handleQuestionOpen = () => {
        this.isWaitingForApproval = true;
    };
    handleQuestionClosed = () => {
        this.isWaitingForApproval = false;
    };

    handleSelectTab = (event: Event) => {
        if (this.isAgentRunning) return;
        const id = Number((event.currentTarget as HTMLButtonElement).dataset.tabId);
        if (!this.browserTabs.some(tab => tab.id === id)) return;
        this.browserTabId = id;
        this.activity = '';
        this.activityStatus = '';
        this.handleCloseTabPicker();
    };

    handleOpenTabPicker = () => {
        if (this.isAgentRunning) return;
        this.tabSearch = '';
        this.isTabPickerOpen = true;
        void this.refreshTabs();
    };

    handleCloseTabPicker = (event?: Event) => {
        event?.preventDefault();
        this.isTabPickerOpen = false;
        this.tabPicker?.close();
    };

    handleTabPickerClosed = () => {
        this.isTabPickerOpen = false;
        const trigger = this.template.querySelector('.browser-target');
        if (trigger instanceof HTMLButtonElement) trigger.focus();
    };

    handleTabPickerBackdrop = (event: MouseEvent) => {
        const picker = event.currentTarget as HTMLDialogElement;
        if (event.target !== picker) return;
        const rect = picker.getBoundingClientRect();
        if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        ) {
            this.handleCloseTabPicker();
        }
    };

    handleTabSearch = (event: Event) => {
        this.tabSearch = (event.target as HTMLInputElement).value;
    };

    handleTabPickerKeydown = (event: KeyboardEvent) => {
        // Search inputs consume Escape to clear their text. Close the picker
        // consistently, including when a filter is present.
        if (event.key === 'Escape' && !event.isComposing) {
            event.stopPropagation();
            this.handleCloseTabPicker(event);
            return;
        }
        const target = event.target as HTMLElement;
        const isSearch = target instanceof HTMLInputElement;
        const options = Array.from(
            this.tabPicker?.querySelectorAll<HTMLButtonElement>('.tab-picker-option') || []
        );
        const index = options.indexOf(target as HTMLButtonElement);
        if (!isSearch && index < 0) return;
        if (isSearch && event.key === 'Enter') {
            event.preventDefault();
            if (!event.isComposing) options[0]?.click();
            return;
        }
        if (event.isComposing || !options.length) return;
        let next: number;
        if (event.key === 'ArrowDown') next = (index + 1) % options.length;
        else if (event.key === 'ArrowUp')
            next = index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length;
        else if (!isSearch && event.key === 'Home') next = 0;
        else if (!isSearch && event.key === 'End') next = options.length - 1;
        else return;
        event.preventDefault();
        options[next].focus();
        options[next].scrollIntoView({ block: 'nearest' });
    };

    tabSite(url: string) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return 'Web page';
        }
    }

    get tabPicker(): HTMLDialogElement | null {
        const picker = this.template.querySelector('.tab-picker');
        return picker instanceof HTMLDialogElement ? picker : null;
    }

    get filteredTabs() {
        const query = this.tabSearch.trim().toLocaleLowerCase();
        return this.browserTabs
            .filter(tab => `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(query))
            .map(tab => {
                const site = this.tabSite(tab.url);
                const selected = tab.id === this.browserTabId;
                return {
                    ...tab,
                    site,
                    selected,
                    title: tab.title || site,
                    initial: site.charAt(0).toUpperCase(),
                    className: `tab-picker-option${selected ? ' tab-picker-option_selected' : ''}`,
                };
            })
            .sort((a, b) => Number(b.selected) - Number(a.selected));
    }

    get hasNoMatchingTabs() {
        return this.filteredTabs.length === 0;
    }
    get tabCountLabel() {
        const count = this.filteredTabs.length;
        return `${count} ${count === 1 ? 'tab' : 'tabs'}${this.tabSearch.trim() ? ' found' : ' available'}`;
    }
    get tabEmptyLabel() {
        return this.browserTabs.length ? 'No matching tabs' : 'No web tabs open';
    }
    get tabEmptyHint() {
        return this.browserTabs.length
            ? 'Try another title or website.'
            : 'Open a website, then choose it here.';
    }
    get browserTargetSite() {
        return this.selectedTab ? this.tabSite(this.selectedTab.url) : 'Choose a tab';
    }
    get browserTargetTitle() {
        return (
            this.selectedTab?.title ||
            (this.browserTabId === undefined ? 'Give your agent a page' : 'Previous tab closed')
        );
    }
    get browserTargetIcon() {
        return this.isAgentRunning ? 'lock-keyhole' : 'chevron-down';
    }

    get selectedTab() {
        return this.browserTabs.find(tab => tab.id === this.browserTabId);
    }
    get browserTargetUrl() {
        return this.selectedTab?.url || '';
    }
    get browserTargetHint() {
        if (this.isAgentRunning) return 'This tab stays fixed while the agent works.';
        return (
            this.browserTargetUrl || 'Open a website to let the agent read and interact with it.'
        );
    }
    get isTargetDisabled() {
        return this.isAgentRunning;
    }
    get statusLabel() {
        if (this.isWaitingForApproval) return 'Your input needed';
        if (this.activityStatus === 'error' && this.activity) return this.activity;
        return this.isAgentRunning ? this.activity || 'Working with you' : 'Ready when you are';
    }
    get statusClass() {
        return `agent-status${this.isAgentRunning ? ' agent-status_working' : ''}${this.activityStatus === 'error' ? ' agent-status_error' : ''}`;
    }
    get chatWorkspaceClass() {
        return this.isSettingsViewOpen ? 'chat-workspace chat-workspace_hidden' : 'chat-workspace';
    }

    handleOpenSettings = async event => {
        event?.preventDefault();
        event?.stopPropagation();
        await this.loadConfigFromCache();
        this.isSettingsViewOpen = true;
    };

    handleCloseSettings = () => {
        this.isSettingsViewOpen = false;
    };

    handleInputChange = event => {
        const key = event?.detail?.key;
        if (!key) return;
        this.config = {
            ...this.config,
            [key]: event.detail.value,
        };
    };

    handleSetupComplete = async () => {
        await this.loadConfigFromCache();
    };

    handleConnectionChange = async () => {
        const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
        const key = CACHE_CONFIG.PROVIDER_CONFIGS.key;
        const providerConfigs = resolveLlmProviderConfigMap(cached);
        // OAuth saves immediately. Update only that snapshot, preserving API/tool drafts.
        this.config = { ...this.config, [key]: providerConfigs };
        this.originalConfig = { ...this.originalConfig, [key]: providerConfigs };
    };

    handleSave = async () => {
        if (this.mcpError) return;
        const settings = this.template.querySelector('agent-ai-settings') as
            | (HTMLElement & { flushConnectionChanges: () => Promise<void> })
            | null;
        await settings?.flushConnectionChanges();
        const configurationList = Object.values(CACHE_CONFIG);
        const config = {};
        Object.values(configurationList).forEach(item => {
            config[item.key] = this.config[item.key];
        });
        // Chrome storage turns LWC membrane-wrapped arrays into indexed objects.
        // Reparse the draft to persist plain server records at this boundary.
        config[CACHE_CONFIG.MCP_SERVERS.key] = parseMcpServersJson(this.mcpDraft).servers;
        // A login or token refresh may have finished while settings were open.
        const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
        config[CACHE_CONFIG.PROVIDER_CONFIGS.key] = resolveLlmProviderConfigMap(cached);
        const providerConfigs = buildEditableProviderConfigs(config);
        Object.assign(config, buildProviderConfigCacheRecord(providerConfigs));
        await cacheManager.saveConfig(config);
        store.dispatch(APPLICATION.reduxSlice.actions.updateSettings(config));
        store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateAiProvider({
                aiProvider: getAiProviderFromConfig(config),
            })
        );
        this.config = { ...config };
        this.originalConfig = { ...config };
        Toast.show({
            label: 'AI settings saved',
            variant: 'success',
        });
    };

    async loadConfigFromCache() {
        const cachedConfiguration = await cacheManager.loadConfig(
            Object.values(CACHE_CONFIG).map(x => x.key)
        );
        const configurationList = Object.values(CACHE_CONFIG);
        const config = {};
        Object.values(configurationList).forEach(item => {
            const cached = cachedConfiguration[item.key];
            config[item.key] = cached !== undefined && cached !== null ? cached : item.defaultValue;
        });
        const providerConfigs = resolveLlmProviderConfigMap(cachedConfiguration);
        Object.assign(config, buildProviderConfigCacheRecord(providerConfigs));
        config.ai_provider = getAiProviderFromConfig(cachedConfiguration);
        if (!Array.isArray(config.metadata_storage_types)) {
            config.metadata_storage_types = [];
        }
        this.config = config;
        this.originalConfig = { ...config };
        const servers = normalizeMcpServerConfigs(config[CACHE_CONFIG.MCP_SERVERS.key]);
        this.mcpDraft = servers.length ? formatMcpServersJson(servers) : '';
        this.mcpError = '';
    }

    handleMcpChange = (event: Event) => {
        this.mcpDraft = (event.target as HTMLTextAreaElement).value;
        const parsed = parseMcpServersJson(this.mcpDraft);
        const errors = [...parsed.errors];
        for (const server of parsed.servers) {
            try {
                const url = new URL(server.url);
                if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
                    errors.push(`${server.name}: use an HTTP(S) URL without embedded credentials.`);
                }
            } catch {
                errors.push(`${server.name}: enter a complete server URL.`);
            }
        }
        this.mcpError = errors.join(' ');
        if (!this.mcpError) {
            this.config = { ...this.config, [CACHE_CONFIG.MCP_SERVERS.key]: parsed.servers };
        }
    };

    get isMcpInvalid() {
        return this.mcpError ? 'true' : 'false';
    }

    get isSaveDisabled() {
        return (
            !!this.mcpError || JSON.stringify(this.config) === JSON.stringify(this.originalConfig)
        );
    }
}
