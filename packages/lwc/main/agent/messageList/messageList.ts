import { LightningElement, api } from 'lwc';
import { mergeToolResults } from './normalizeMessages';
import { groupCompletedActivity } from './activityGroups';

export default class AgentMessageList extends LightningElement {
    @api welcomeMessage: string | undefined;
    @api displayedMessages: any[] = [];
    @api assistantStyle = false;
    @api conversationId = '';
    get listClass() {
        return `message-list-container${this.assistantStyle ? ' assistant-transcript' : ''}`;
    }
    @api loadingStatus = '';

    get showStandaloneWelcome() {
        return false;
    }

    get listMessages() {
        const list = Array.isArray(this.displayedMessages) ? this.displayedMessages : [];
        const merged = mergeToolResults(list);

        const entries = merged.map((message, index) => ({
            key: `${this.conversationId}:${(message as { id?: string })?.id || `msg-${index}`}`,
            message,
            // Only the final message in the list carries the copy affordance
            // (the assistant's last answer to the user) — never intermediate
            // turns or tool exchanges. During streaming the live message is
            // rendered separately and stays uncopyable until it finalizes here.
            isLast: index === merged.length - 1,
        }));
        return this.assistantStyle
            ? groupCompletedActivity(entries, this.isLoading || !!this.visibleStreamingMessage)
            : entries;
    }

    get visibleStreamingMessage() {
        if (!this.streamingMessage || this.streamingMessage.role === 'system') {
            return null;
        }
        return this.streamingMessage;
    }

    get hasLoadingStatus() {
        return typeof this.loadingStatus === 'string' && this.loadingStatus.trim().length > 0;
    }

    _streamingMessage: any = null;
    @api isLoading = false;

    _userIsAtBottom = true;
    _scrollThreshold = 80;
    _scrollPending = false;
    _scrollContainer: Element | null = null;
    _scrollListenerAttached = false;

    @api
    scrollToBottom(preservePosition = false) {
        if (this.assistantStyle && preservePosition && !this._userIsAtBottom) return;
        const container = this._getScrollContainer();
        if (!container) return;
        this._userIsAtBottom = true;
        container.scrollTop = container.scrollHeight - container.clientHeight;
    }

    get showScrollToBottomButton() {
        return !this._userIsAtBottom;
    }

    @api
    get streamingMessage() {
        return this._streamingMessage;
    }
    set streamingMessage(val) {
        this._streamingMessage = val;
        this._scheduleScrollToBottom();
    }

    renderedCallback() {
        this._attachScrollListener();
        if (!this.assistantStyle) this._updateIsAtBottomFromContainer();
        if (!this.streamingMessage) {
            requestAnimationFrame(() => this._scrollToBottomIfAtBottom());
        }
    }

    disconnectedCallback() {
        if (this._scrollContainer) {
            this._scrollContainer.removeEventListener('scroll', this._onUserScroll);
            this._scrollContainer = null;
        }
        this._scrollListenerAttached = false;
    }

    /** Events **/

    handleRetryEvent = event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('retry', { detail: event.detail }));
    };

    handleActivityToggle = () => {
        // Native disclosure changes layout without rerendering the transcript. Keep
        // scroll state current so opening earlier evidence does not jump to the end.
        this._updateIsAtBottomFromContainer();
    };
    /** Methods **/

    _getScrollContainer() {
        const section = this.template.host?.closest?.('section[data-id="chatSection"]');
        if (section) return section;
        return this.template.querySelector('.slds-chat-list') || null;
    }

    _updateIsAtBottomFromContainer() {
        const container = this._getScrollContainer();
        if (!container) return;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const atBottom = scrollHeight - scrollTop - clientHeight <= this._scrollThreshold;
        if (this._userIsAtBottom !== atBottom) {
            this._userIsAtBottom = atBottom;
        }
    }

    _scheduleScrollToBottom() {
        if (this._scrollPending) return;
        this._scrollPending = true;
        requestAnimationFrame(() => {
            this._scrollPending = false;
            this._scrollToBottomIfAtBottom();
        });
    }

    _scrollToBottomIfAtBottom() {
        const container = this._getScrollContainer();
        if (!container) return;
        if (!this._userIsAtBottom) return;
        const { scrollTop, scrollHeight, clientHeight } = container;
        const atBottom = scrollHeight - scrollTop - clientHeight <= this._scrollThreshold;
        if (!this.assistantStyle && !atBottom) return;
        container.scrollTop = scrollHeight - clientHeight;
    }

    _attachScrollListener() {
        if (this._scrollListenerAttached) return;
        const container = this._getScrollContainer();
        if (container) {
            this._scrollContainer = container;
            container.addEventListener('scroll', this._onUserScroll, { passive: true });
            this._scrollListenerAttached = true;
        }
    }

    _onUserScroll = event => {
        const container = event.target;
        const { scrollTop, scrollHeight, clientHeight } = container;
        this._userIsAtBottom = scrollHeight - scrollTop - clientHeight <= this._scrollThreshold;
    };

    handleScrollToBottom = () => {
        this.scrollToBottom();
    };
}
