import { discoverSkills, type DiscoveredSkill } from 'agent/utils';
import { createFocusTrap, type FocusTrap } from 'slds/focusTrap';
import { getIndexedDbFileSystem } from 'core/fs';
import { announce } from 'host-api/announce';
import { registerShortcut } from 'host-api/shortcuts';
import Toast from 'lightning/toast';
import { api, track, LightningElement } from 'lwc';
import LOGGER from 'shared/logger';

import { saveSkillToFs, deleteSkillFromFs, getSkillNameError } from '../tools/modules/skillUtils';

type Mode = 'list' | 'edit' | 'create';

type SkillRow = DiscoveredSkill & {
    key: string;
    scopeBadge: string;
    scopeBadgeClass: string;
    isEditable: boolean;
    isDeletable: boolean;
    isDuplicable: boolean;
};

export default class SkillsPanel extends LightningElement {
    @api initialQuery = '';

    _isOpen = false;
    _focusTrap: FocusTrap | null = null;
    _unregisterCloseShortcut: (() => void) | null = null;
    _unregisterIndentShortcut: (() => void) | null = null;

    @api
    get isOpen() {
        return this._isOpen;
    }
    set isOpen(value) {
        const next = !!value;
        const wasOpen = this._isOpen;
        this._isOpen = next;
        if (next && !wasOpen) {
            this.searchTerm = String(this.initialQuery || '');
            this.refresh();
            document.addEventListener('keydown', this._handleDocumentKeydown, true);
            // Activate on next frame so the template has rendered and the
            // focusable toolbar/inputs exist before we query for them.
            // eslint-disable-next-line no-undef
            requestAnimationFrame(() => {
                if (!this._isOpen) return;
                this._focusTrap = createFocusTrap(this.template);
                this._focusTrap.activate();
            });
            announce('Skills panel opened');
        } else if (!next && wasOpen) {
            document.removeEventListener('keydown', this._handleDocumentKeydown, true);
            if (this._focusTrap) {
                this._focusTrap.deactivate();
                this._focusTrap = null;
            }
            announce('Skills panel closed');
        }
    }

    connectedCallback() {
        this._unregisterCloseShortcut = registerShortcut({
            id: 'skills.close',
            keys: 'Escape',
            label: 'Close skills panel',
            scope: 'Agent',
        });
        this._unregisterIndentShortcut = registerShortcut({
            id: 'skills.indent',
            keys: '(button)',
            label: 'Insert indent in editor',
            scope: 'Agent',
            description: 'Button in the skill editor toolbar',
        });
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._handleDocumentKeydown, true);
        if (this._focusTrap) {
            this._focusTrap.deactivate();
            this._focusTrap = null;
        }
        if (this._unregisterCloseShortcut) {
            this._unregisterCloseShortcut();
            this._unregisterCloseShortcut = null;
        }
        if (this._unregisterIndentShortcut) {
            this._unregisterIndentShortcut();
            this._unregisterIndentShortcut = null;
        }
    }

    _handleDocumentKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !this._isOpen) return;
        const target = event.target as HTMLElement | null;
        if (target) {
            const tag = target.tagName;
            if (
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                target.isContentEditable
            ) {
                return;
            }
        }
        event.preventDefault();
        event.stopPropagation();
        if (this.isEditorMode) {
            this.handleCancel();
        } else {
            this.handleClose();
        }
    };

    @track mode: Mode = 'list';
    @track searchTerm = '';
    @track isLoading = false;
    @track error: string | null = null;
    @track skills: DiscoveredSkill[] = [];

    // Editor state
    @track editorName = '';
    @track editorDescription = '';
    @track editorContent = '';
    @track editorIsFromBundled = false;
    @track editorIsCreate = false;
    @track editorOriginalName = '';
    @track editorError: string | null = null;
    @track isSaving = false;

    _lastSyncedContent: string | null = null;

    renderedCallback() {
        if (!this.isEditorMode) {
            this._lastSyncedContent = null;
            return;
        }
        const bodyEl = this.template.querySelector(
            '.skill-body-editor'
        ) as HTMLTextAreaElement | null;
        if (bodyEl && this._lastSyncedContent !== this.editorContent) {
            bodyEl.value = this.editorContent;
            this._lastSyncedContent = this.editorContent;
        }
    }

    async refresh() {
        this.isLoading = true;
        this.error = null;
        try {
            this.skills = await discoverSkills();
        } catch (err) {
            LOGGER.error('[agent] skills discovery failed', err);
            this.error = (err as Error)?.message || 'Failed to load skills.';
            this.skills = [];
        } finally {
            this.isLoading = false;
        }
    }

    get rows(): SkillRow[] {
        const term = this.searchTerm.trim().toLowerCase();
        const filtered = term
            ? this.skills.filter(
                  s =>
                      s.name.toLowerCase().includes(term) ||
                      s.description.toLowerCase().includes(term)
              )
            : this.skills;
        return filtered.map(s => {
            const badge = s.source === 'bundled' ? 'Default' : 'Custom';
            const badgeClass =
                s.source === 'bundled'
                    ? 'skills-badge skills-badge-bundled'
                    : 'skills-badge skills-badge-custom';
            return {
                ...s,
                key: `${s.source}:${s.name}:${s.skillMdPath}`,
                scopeBadge: badge,
                scopeBadgeClass: badgeClass,
                isEditable: s.source === 'custom',
                isDeletable: s.source === 'custom',
                isDuplicable: s.source === 'bundled',
            };
        });
    }

    get isListMode() {
        return this.mode === 'list';
    }
    get isEditorMode() {
        return this.mode === 'edit' || this.mode === 'create';
    }
    get hasRows() {
        return this.rows.length > 0;
    }
    get hasSkills() {
        return this.skills.length > 0;
    }
    get showEmptyState() {
        return !this.isLoading && !this.error && !this.hasRows;
    }
    get emptyMessage() {
        if (this.searchTerm.trim()) return 'No skills match your search.';
        return 'No skills available yet.';
    }
    get editorTitle() {
        return this.editorIsCreate ? 'New skill' : `Edit ${this.editorOriginalName || 'skill'}`;
    }
    get nameInputDisabled() {
        return !this.editorIsCreate;
    }
    get showBundledCopyNote() {
        return this.editorIsFromBundled;
    }
    get saveDisabled() {
        return (
            this.isSaving ||
            !this.editorName.trim() ||
            !this.editorDescription.trim() ||
            !this.editorContent.trim()
        );
    }

    // --- List handlers ---

    handleSearchInput = (event: Event) => {
        this.searchTerm = (event.target as HTMLInputElement).value;
    };

    handleRefresh = () => {
        this.refresh();
    };

    handleClose = () => {
        this.dispatchEvent(new CustomEvent('close'));
    };

    handleCreate = () => {
        this.mode = 'create';
        this.editorIsCreate = true;
        this.editorIsFromBundled = false;
        this.editorOriginalName = '';
        this.editorName = '';
        this.editorDescription = '';
        this.editorContent = '';
        this.editorError = null;
    };

    handleEdit = async (event: Event) => {
        const name = (event.currentTarget as HTMLElement).dataset.name || '';
        const skill = this.skills.find(s => s.name === name && s.source === 'custom');
        if (!skill) return;
        const body = await this._readSkillBody(skill);
        if (body === null) return;
        this.mode = 'edit';
        this.editorIsCreate = false;
        this.editorIsFromBundled = false;
        this.editorOriginalName = skill.name;
        this.editorName = skill.name;
        this.editorDescription = skill.description;
        this.editorContent = body;
        this.editorError = null;
    };

    handleDuplicate = async (event: Event) => {
        const name = (event.currentTarget as HTMLElement).dataset.name || '';
        const skill = this.skills.find(s => s.name === name && s.source === 'bundled');
        if (!skill) return;
        const body = await this._readSkillBody(skill);
        if (body === null) return;
        const proposedName = this._nextAvailableName(`${skill.name}-custom`);
        this.mode = 'create';
        this.editorIsCreate = true;
        this.editorIsFromBundled = true;
        this.editorOriginalName = skill.name;
        this.editorName = proposedName;
        this.editorDescription = skill.description;
        this.editorContent = body;
        this.editorError = null;
    };

    async _readSkillBody(skill: DiscoveredSkill): Promise<string | null> {
        const fs = getIndexedDbFileSystem();
        try {
            const content = await fs.readFile(skill.skillMdPath, 'utf-8');
            return stripFrontmatter(content);
        } catch (err) {
            this.error = `Failed to read skill: ${(err as Error)?.message || err}`;
            return null;
        }
    }

    _nextAvailableName(base: string): string {
        const taken = new Set(this.skills.map(s => s.name));
        if (!taken.has(base)) return base;
        let i = 2;
        while (taken.has(`${base}-${i}`)) i++;
        return `${base}-${i}`;
    }

    handleDelete = async (event: Event) => {
        const name = (event.currentTarget as HTMLElement).dataset.name || '';
        const skill = this.skills.find(s => s.name === name && s.source === 'custom');
        if (!skill) return;
        const confirmMessage = `Delete skill "${skill.name}"? This cannot be undone.`;
        // eslint-disable-next-line no-alert
        if (!window.confirm(confirmMessage)) return;
        const fs = getIndexedDbFileSystem();
        const result = await deleteSkillFromFs(fs, { name: skill.name });
        if (!result.ok) {
            const msg = result.error || 'Delete failed';
            Toast.show({ message: msg, variant: 'error' });
            announce(msg, { assertive: true });
            return;
        }
        const ok = `Skill "${skill.name}" deleted`;
        Toast.show({ message: ok, variant: 'success' });
        announce(ok);
        await this.refresh();
    };

    // --- Editor handlers ---

    handleNameInput = (event: Event) => {
        this.editorName = (event.target as HTMLInputElement).value;
        if (this.editorError) this.editorError = null;
    };

    handleDescriptionInput = (event: Event) => {
        this.editorDescription = (event.target as HTMLTextAreaElement).value;
    };

    handleDescriptionChange = (event: CustomEvent) => {
        this.editorDescription = (event.detail as { value: string }).value;
    };

    handleContentInput = (event: Event) => {
        const value = (event.target as HTMLTextAreaElement).value;
        this.editorContent = value;
        this._lastSyncedContent = value;
    };

    // Tab is intentionally NOT intercepted on the textarea. Previously we
    // hijacked Tab to insert 2 spaces, which trapped keyboard-only and
    // screen-reader users inside the editor. Indentation is now available
    // via the "Insert indent" toolbar button (handleInsertIndent) so Tab
    // behaves as expected for focus navigation (a11y: WCAG 2.1 2.1.2).
    handleInsertIndent = () => {
        const target = this.template.querySelector(
            '.skill-body-editor'
        ) as HTMLTextAreaElement | null;
        if (!target) return;
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const value = target.value;
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        target.value = next;
        target.selectionStart = target.selectionEnd = start + 2;
        this.editorContent = next;
        this._lastSyncedContent = next;
        target.focus();
    };

    handleCancel = () => {
        this.mode = 'list';
        this.editorError = null;
    };

    handleSave = async () => {
        const name = this.editorName.trim();
        if (this.editorIsCreate) {
            const nameErr = getSkillNameError(name);
            if (nameErr) {
                this.editorError = nameErr;
                return;
            }
            if (this.skills.some(s => s.name === name && s.source === 'custom')) {
                this.editorError = `A custom skill named "${name}" already exists.`;
                return;
            }
        }
        this.isSaving = true;
        try {
            const fs = getIndexedDbFileSystem();
            const result = await saveSkillToFs(fs, {
                name,
                description: this.editorDescription,
                content: this.editorContent,
                overwrite: true,
            });
            if (!result.ok) {
                this.editorError = result.error || 'Save failed.';
                return;
            }
            const ok = `Skill "${name}" saved`;
            Toast.show({ message: ok, variant: 'success' });
            announce(ok);
            this.mode = 'list';
            await this.refresh();
        } catch (err) {
            this.editorError = (err as Error)?.message || 'Save failed.';
        } finally {
            this.isSaving = false;
        }
    };
}

function stripFrontmatter(raw: string): string {
    const trimmed = String(raw || '');
    if (!trimmed.startsWith('---')) return trimmed;
    const rest = trimmed.slice(3).split(/\r?\n/);
    const bodyStart = rest.slice(1).findIndex(line => line.trim() === '---');
    if (bodyStart < 0) return trimmed;
    return rest
        .slice(bodyStart + 2)
        .join('\n')
        .replace(/^\n+/, '');
}
