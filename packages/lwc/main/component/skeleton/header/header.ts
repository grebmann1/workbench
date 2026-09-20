import { LightningElement, api, wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import { connectStore, store as legacyStore, store_application } from 'shared/store';
import { isEmpty, classSet, isNotUndefinedOrNull } from 'shared/utils';
import ModalLauncher from 'skeleton/modalLauncher';

export default class Header extends LightningElement {
    @api currentApplicationName = 'App Name';
    @api currentTabName = 'Home';
    @api applications;
    @api isUserLoggedIn = false;

    @api isMenuSmall = false;
    @api managedLayout = false;

    @api isAgentChatExpanded = false;
    @api isAgentVisible = false;

    @wire(NavigationContext)
    navContext;

    @wire(connectStore, { store: legacyStore })
    applicationChange({ application }) {
        // Toggle Menu
        if (!this.managedLayout && isNotUndefinedOrNull(application.isMenuExpanded)) {
            this.isMenuSmall = !application.isMenuExpanded;
        }
    }

    connectedCallback() {
        this.loadCache();
    }

    /** Events **/

    handleToggle = () => {
        if (this.managedLayout) {
            this.dispatchEvent(
                new CustomEvent('menutoggle', { detail: { collapsed: !this.isMenuSmall } })
            );
            return;
        }
        this.isMenuSmall = !this.isMenuSmall;
        if (this.isMenuSmall) {
            legacyStore.dispatch(store_application.collapseMenu());
        } else {
            legacyStore.dispatch(store_application.expandMenu());
        }

        window.defaultStore.setItem('header-isMenuSmall', JSON.stringify(this.isMenuSmall));
    };

    handleToggle_rightPanel = () => {
        if (this.isAgentChatExpanded) {
            legacyStore.dispatch(store_application.collapseAgentChat());
        } else {
            legacyStore.dispatch(store_application.expandAgentChat());
            // Collapse the left menu to free up horizontal space for the agent panel
            if (!this.managedLayout && !this.isMenuSmall) {
                this.isMenuSmall = true;
                legacyStore.dispatch(store_application.collapseMenu());
                window.defaultStore.setItem('header-isMenuSmall', JSON.stringify(this.isMenuSmall));
            }
        }
    };

    selectTab = e => {
        const target = e.currentTarget.dataset.path;
        if (!isEmpty(target)) {
            navigate(this.navContext, { type: 'application', state: { applicationName: target } });
        } else {
            navigate(this.navContext, { type: 'home' });
        }
    };

    deleteTab = e => {
        e.stopPropagation();
        const applicationId = e.currentTarget.dataset.key;
        this._restoreFocus = e.currentTarget.matches(':focus') ? applicationId : null;
        this.dispatchEvent(new CustomEvent('tabdelete', { detail: { id: applicationId } }));
    };

    _restoreFocus: string | null = null;

    get dom(): ShadowRoot {
        return this.template;
    }

    renderedCallback() {
        if (
            !this._restoreFocus ||
            (this.applications || []).some(app => app.id === this._restoreFocus)
        )
            return;
        this._restoreFocus = null;
        // Route and store updates can render separately. Focus the final active tab.
        requestAnimationFrame(() => {
            if (!this.dom.host.isConnected) return;
            const target =
                this.dom.querySelector<HTMLButtonElement>('button[aria-current="page"]') ||
                this.dom.querySelector<HTMLButtonElement>('[data-path="home"]');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }

    handleTabFocus = e => {
        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    get visibleApplications() {
        return (this.applications || [])
            .filter(app => app.isTabVisible)
            .map(app => ({
                ...app,
                ariaCurrent: app.isActive ? 'page' : null,
                closeLabel: `Close ${app.label}`,
            }));
    }

    get homeCurrent() {
        return (this.applications || []).some(app => app.name === 'home/app' && app.isActive)
            ? 'page'
            : null;
    }

    /** Methods **/

    loadCache = async () => {
        try {
            const _isMenuSmall = await window.defaultStore.getItem('header-isMenuSmall');
            if (!isEmpty(_isMenuSmall)) {
                const collapsed = _isMenuSmall === 'true';
                if (!this.managedLayout) this.isMenuSmall = collapsed;
                if (collapsed) {
                    legacyStore.dispatch(store_application.collapseMenu());
                } else {
                    legacyStore.dispatch(store_application.expandMenu());
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    openLauncher = () => {
        ModalLauncher.open({
            isUserLoggedIn: this.isUserLoggedIn,
        }).then(res => {
            if (res) {
                this.dispatchEvent(new CustomEvent('newapp', { detail: res }));
            }
        });
    };

    /** Getters */

    get collapseClass() {
        return classSet('slds-grid button-container')
            .add({
                'slds-grid_align-end': !this.isMenuSmall,
                'slds-grid_align-center': this.isMenuSmall,
            })
            .toString();
    }

    get rightPanelCollapseClass() {
        return classSet('slds-grid button-container')
            .add({
                'slds-grid_align-end': !this.isAgentChatExpanded,
            })
            .toString();
    }
    get leftPanelIconName() {
        return this.isMenuSmall ? 'utility:toggle_panel_left' : 'utility:toggle_panel_right';
    }

    get leftPanelLabel() {
        return this.isMenuSmall ? 'Expand navigation' : 'Collapse navigation';
    }

    get rightPanelLabel() {
        return this.isAgentChatExpanded ? 'Close AI assistant' : 'Open AI assistant';
    }

    get rightPanelIconName() {
        return this.isAgentChatExpanded ? 'utility:einstein_alt' : 'utility:einstein';
    }

    @api focusNavigationToggle() {
        const control = this.dom.querySelector<HTMLElement>('[data-toggle="navigation"]');
        control?.focus();
    }

    @api focusAssistantToggle() {
        const control = this.dom.querySelector<HTMLElement>('[data-toggle="assistant"]');
        control?.focus();
    }
}
