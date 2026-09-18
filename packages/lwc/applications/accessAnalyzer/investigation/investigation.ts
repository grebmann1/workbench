import ToolkitElement from 'host-api/element';
import type { ConnectorLike } from 'host-api/connector';
import { connectStore, store } from 'host-api/store';
import { api, wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import {
    currentInvestigation,
    investigationOrgKey,
    investigationRoute,
} from 'shared/recordInvestigation';
import { getSetupEntityPagePath, getObjectManagerSectionPath } from 'shared/utils';
import {
    accessEvidenceNote,
    investigateAccess,
    searchAccessUsers,
} from '../accessEvidence/accessEvidence';
import type { AccessEvidence } from '../accessEvidence/accessEvidence';
import { COVERAGE } from '../accessEvidence/constants';

type UserOption = { id: string; name: string; username: string; active: boolean | null };

export default class Investigation extends ToolkitElement {
    @wire(NavigationContext) navContext: Parameters<typeof navigate>[0];
    _investigation = '';
    _orgKey = '';
    _connector: ConnectorLike | null = null;
    _requestToken = 0;
    _searchToken = 0;
    objectName = '';
    recordId = '';
    fieldName = '';
    userSearch = '';
    users: UserOption[] = [];
    selectedUser: UserOption | null = null;
    evidence: AccessEvidence | null = null;
    isLoading = false;
    isSearching = false;
    error = '';
    searchMessage = '';

    @api get investigation() {
        return this._investigation;
    }
    set investigation(value: string) {
        if (value === this._investigation) return;
        this.invalidate();
        this._investigation = value || '';
        const context = this.context;
        this.objectName = context?.objectName || '';
        this.recordId = context?.recordId || '';
        this.fieldName = context?.fields[0] || '';
    }

    @wire(connectStore, { store })
    connectionChanged() {
        const connector = this.connector;
        const key = investigationOrgKey(connector);
        if (this._orgKey && (key !== this._orgKey || connector !== this._connector)) {
            this.invalidate();
            this._searchToken++;
            this.isSearching = false;
            this.users = [];
            this.selectedUser = null;
            this.userSearch = '';
            this.searchMessage = '';
            this.objectName = '';
            this.recordId = '';
            this.fieldName = '';
            this._investigation = '';
            this.error = 'Connection changed. Select a user and record in the current org.';
        }
        this._orgKey = key;
        this._connector = connector;
    }

    disconnectedCallback() {
        this._requestToken++;
        this._searchToken++;
    }
    invalidate() {
        this._requestToken++;
        this.evidence = null;
        this.error = '';
        this.isLoading = false;
    }

    get context() {
        return currentInvestigation(this._investigation, this.connector);
    }
    get orgLabel() {
        return investigationOrgKey(this.connector).replace('|', ' · ');
    }
    get connectedUserLabel() {
        return (
            this.connector?.configuration?.username ||
            this.connector?.configuration?.alias ||
            'Connected session'
        );
    }
    get contextLocked() {
        return !!this.context || this.isLoading;
    }
    get runDisabled() {
        return this.isLoading || !this.selectedUser || !this.objectName || !this.recordId;
    }
    get searchDisabled() {
        return this.isSearching || this.isLoading;
    }
    get exportDisabled() {
        return !this.evidence || this.isLoading;
    }
    get hasUsers() {
        return this.users.length > 0;
    }
    get selectedUserLabel() {
        return this.selectedUser
            ? `${this.selectedUser.name} · ${this.selectedUser.username} · ${this.selectedUser.id}`
            : 'No target user selected';
    }
    get inactiveUser() {
        return this.evidence?.targetActive === false;
    }
    get coverage() {
        return COVERAGE.map((detail, index) => ({ id: String(index), detail }));
    }
    get checks() {
        return (this.evidence?.checks || []).map(check => ({
            ...check,
            readLabel: check.read === null ? 'Unknown' : check.read ? 'Allowed' : 'Not allowed',
            editLabel: check.edit === null ? 'Unknown' : check.edit ? 'Allowed' : 'Not allowed',
            canOpenQuery: !!check.query,
        }));
    }
    get summary() {
        if (!this.evidence) return '';
        const [object, field, record] = this.evidence.checks;
        if (object.edit === false)
            return 'Salesforce reports that this user cannot edit this object. Inspect object permissions first.';
        if (field.edit === false)
            return 'Salesforce reports that this user cannot edit the selected field. Inspect field permissions and configured sources.';
        if (record.edit === false)
            return 'Salesforce reports that this user cannot edit this record. Inspect record sharing and the other access layers.';
        return 'Review each access layer below. These checks do not establish whether an edit will succeed in the user’s page or session.';
    }

    handleInput = (event: Event) => {
        const input = event.target as HTMLInputElement;
        this.invalidate();
        if (input.name === 'objectName') this.objectName = input.value;
        if (input.name === 'recordId') this.recordId = input.value;
        if (input.name === 'fieldName') this.fieldName = input.value;
    };
    handleUserSearchInput = (event: Event) => {
        this.userSearch = (event.target as HTMLInputElement).value;
        this._searchToken++;
        this.isSearching = false;
        this.users = [];
        this.searchMessage = '';
    };
    handleSearch = async () => {
        const connector = this.connector,
            orgKey = investigationOrgKey(connector);
        if (!connector?.conn || !orgKey) return;
        const token = ++this._searchToken;
        const current = () =>
            token === this._searchToken &&
            connector === this.connector &&
            orgKey === investigationOrgKey(this.connector);
        this.isSearching = true;
        this.users = [];
        this.searchMessage = '';
        try {
            const result = await searchAccessUsers(connector.conn, this.userSearch);
            if (!current()) return;
            this.users = result.users;
            this.searchMessage = result.truncated
                ? 'Showing the first 20 users. Refine your search.'
                : !result.users.length
                  ? 'No visible users match this search.'
                  : 'Choose one target user.';
        } catch {
            if (current())
                this.searchMessage =
                    'User search unavailable. Enter 2–100 characters and verify your connection and permission to view users.';
        } finally {
            if (current()) this.isSearching = false;
        }
    };
    handleSelectUser = (event: Event) => {
        const id = (event.currentTarget as HTMLElement).dataset.id;
        this.invalidate();
        this.selectedUser = this.users.find(user => user.id === id) || null;
        this.users = [];
        this.searchMessage = '';
    };
    handleRun = async () => {
        const connector = this.connector,
            orgKey = investigationOrgKey(connector);
        if (!connector?.conn || !orgKey || !this.selectedUser) return;
        const input = {
            objectName: this.objectName,
            recordId: this.recordId,
            fieldName: this.fieldName,
            userId: this.selectedUser.id,
        };
        const token = ++this._requestToken;
        const current = () =>
            token === this._requestToken &&
            connector === this.connector &&
            orgKey === investigationOrgKey(this.connector);
        this.isLoading = true;
        this.evidence = null;
        this.error = '';
        try {
            const evidence = await investigateAccess(connector.conn, input);
            if (current()) {
                this.evidence = evidence;
                Promise.resolve().then(() => {
                    if (current()) this.refs?.findings?.scrollIntoView({ block: 'start' });
                });
            }
        } catch {
            if (current())
                this.error =
                    'Investigation unavailable. Verify the selected user, object and record ID, then rerun. No access conclusion was made.';
        } finally {
            if (current()) this.isLoading = false;
        }
    };
    handleReturn = () => {
        const context = this.context;
        if (context)
            navigate(this.navContext, {
                type: 'application',
                state: investigationRoute(context, 'recordviewer'),
            });
    };
    handleOpenQuery = (event: Event) => {
        const check = this.evidence?.checks.find(
            item => item.key === (event.currentTarget as HTMLElement).dataset.key
        );
        if (!check?.query) return;
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'soql', query: check.query, queryApi: check.mode },
        });
    };
    openSetup(path: string) {
        const origin = this.connector?.conn?.instanceUrl;
        if (origin) window.open(`${new URL(origin).origin}${path}`, '_blank', 'noopener');
    }
    handleUserSetup = () => {
        if (this.selectedUser)
            this.openSetup(
                getSetupEntityPagePath({ setupEntity: 'ManageUsers', id: this.selectedUser.id })
            );
    };
    handleObjectSetup = () => {
        if (this.evidence)
            this.openSetup(
                getObjectManagerSectionPath({
                    objectApiName: this.evidence.input.objectName,
                    section: 'FieldsAndRelationships',
                })
            );
    };
    handleSourceSetup = (event: Event) => {
        const source = this.evidence?.sources.find(
            item => item.id === (event.currentTarget as HTMLElement).dataset.id
        );
        if (source) this.openSetup(source.setupUrl);
    };
    handleExport = () => {
        if (!this.evidence) return;
        const url = URL.createObjectURL(
            new Blob([accessEvidenceNote(this.evidence, this.orgLabel, this.connectedUserLabel)], {
                type: 'text/markdown',
            })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `user-access-${this.evidence.input.userId}-${this.evidence.input.recordId}.md`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
}
