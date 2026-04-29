import { discoverSkills, type DiscoveredSkill } from 'agent/utils';
import { getIndexedDbFileSystem } from 'core/fs';
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
        }
    }

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
            Toast.show({ message: result.error || 'Delete failed', variant: 'error' });
            return;
        }
        Toast.show({ message: `Skill "${skill.name}" deleted`, variant: 'success' });
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

    handleContentKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const target = event.target as HTMLTextAreaElement;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        const value = target.value;
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        target.value = next;
        target.selectionStart = target.selectionEnd = start + 2;
        this.editorContent = next;
        this._lastSyncedContent = next;
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
            Toast.show({ message: `Skill "${name}" saved`, variant: 'success' });
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
