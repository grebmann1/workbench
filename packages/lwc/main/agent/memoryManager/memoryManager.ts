import { LightningElement, api, track, wire } from 'lwc';
import { connectStore, store } from 'core/store';
import { getIndexedDbFileSystem } from 'core/fs';
import { readMemories, saveMemory, type MemoryFile, type MemoryScope } from '../memory/memory';
import {
    addDocument,
    listDocuments,
    removeDocument,
    searchDocuments,
    type KnowledgeDocument,
} from '../memory/knowledge';
import { executeGoogleOperation } from '../googleWorkspace/googleWorkspace';
import { z } from 'zod';

const driveFile = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    webViewLink: z.string().optional(),
});
type DriveFile = z.infer<typeof driveFile>;
export default class MemoryManager extends LightningElement {
    @track memories: MemoryFile[] = [];
    @track documents: KnowledgeDocument[] = [];
    @track driveFiles: DriveFile[] = [];
    @track results: Awaited<ReturnType<typeof searchDocuments>> = [];
    @track error = '';
    @track status = '';
    @track busy = false;
    @api googleEnabled = false;
    scope: MemoryScope = {};
    scopeKey = '';
    query = '';
    driveQuery = '';
    refreshVersion = 0;
    savedContents = new Map<string, string>();

    @wire(connectStore, { store })
    storeChange({ application }) {
        const config = application?.connector?.configuration || {};
        const key = JSON.stringify([config.orgId, config.alias]);
        if (key !== this.scopeKey) {
            this.scopeKey = key;
            this.scope = { orgId: config.orgId, alias: config.alias };
            void this.refresh();
        }
    }
    renderedCallback() {
        this.template
            .querySelectorAll('textarea[data-memory-editor]')
            .forEach((input: HTMLTextAreaElement) => {
                const content =
                    this.memories.find(memory => memory.path === input.dataset.path)?.content || '';
                if (input.value !== content) input.value = content;
            });
    }
    connectedCallback() {
        void this.refresh();
    }
    async refresh() {
        const version = ++this.refreshVersion;
        try {
            const fs = getIndexedDbFileSystem();
            const [memories, documents] = await Promise.all([
                readMemories(fs, this.scope),
                listDocuments(fs),
            ]);
            if (version !== this.refreshVersion) return;
            this.memories = memories;
            this.savedContents = new Map(memories.map(memory => [memory.path, memory.content]));
            this.documents = documents;
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        }
    }
    async perform(action: () => Promise<void>, message: string) {
        this.busy = true;
        this.error = '';
        this.status = '';
        try {
            await action();
            this.status = message;
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            this.busy = false;
        }
    }
    handleMemoryChange(event: Event) {
        const input = event.target as HTMLTextAreaElement;
        this.memories = this.memories.map(memory =>
            memory.path === input.dataset.path ? { ...memory, content: input.value } : memory
        );
    }
    handleSave(event: Event) {
        const path = (event.currentTarget as HTMLElement).dataset.path;
        const memory = this.memories.find(item => item.path === path);
        if (memory)
            void this.perform(async () => {
                await saveMemory(
                    getIndexedDbFileSystem(),
                    memory.path,
                    memory.content,
                    this.scope,
                    this.savedContents.get(memory.path)
                );
                this.savedContents.set(memory.path, memory.content);
            }, 'Memory saved. It will be available on the next run.');
    }
    handleForget(event: Event) {
        const path = (event.currentTarget as HTMLElement).dataset.path;
        if (path)
            void this.perform(async () => {
                await saveMemory(
                    getIndexedDbFileSystem(),
                    path,
                    '',
                    this.scope,
                    this.savedContents.get(path)
                );
                this.savedContents.set(path, '');
                this.memories = this.memories.map(memory =>
                    memory.path === path ? { ...memory, content: '' } : memory
                );
            }, 'These memory notes were cleared.');
    }
    handleFiles(event: Event) {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files || []);
        input.value = '';
        void this.perform(async () => {
            for (const file of files) {
                if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 1000000)
                    throw new Error('Choose TXT, Markdown, CSV, or JSON files up to 1 MB.');
                await addDocument(getIndexedDbFileSystem(), {
                    id: crypto.randomUUID(),
                    title: file.name,
                    text: await file.text(),
                    updatedAt: new Date().toISOString(),
                });
            }
            this.documents = await listDocuments(getIndexedDbFileSystem());
        }, 'Documents added to knowledge.');
    }
    handleRemove(event: Event) {
        const id = (event.currentTarget as HTMLElement).dataset.id;
        if (id)
            void this.perform(async () => {
                await removeDocument(getIndexedDbFileSystem(), id);
                this.documents = await listDocuments(getIndexedDbFileSystem());
                this.results = [];
            }, 'Document removed from knowledge.');
    }
    handleQuery(event: Event) {
        this.query = (event.target as HTMLInputElement).value;
    }
    handleSearch() {
        void this.perform(async () => {
            this.results = await searchDocuments(getIndexedDbFileSystem(), this.query);
        }, 'Search complete.');
    }
    handleDriveQuery(event: Event) {
        this.driveQuery = (event.target as HTMLInputElement).value;
    }
    handleDriveSearch() {
        void this.perform(async () => {
            if (!this.googleEnabled) throw new Error('Enable Google Workspace in AI tools first.');
            const result = z
                .object({ files: z.array(driveFile) })
                .parse(await executeGoogleOperation('drive.listFiles', { query: this.driveQuery }));
            this.driveFiles = result.files;
        }, 'Choose a file to add a local text snapshot.');
    }
    handleDriveAdd(event: Event) {
        const file = this.driveFiles.find(
            item => item.id === (event.currentTarget as HTMLElement).dataset.id
        );
        if (!file) return;
        void this.perform(async () => {
            if (!this.googleEnabled) throw new Error('Enable Google Workspace first.');
            const exportable = [
                'application/vnd.google-apps.document',
                'application/vnd.google-apps.presentation',
            ].includes(file.mimeType);
            if (
                !exportable &&
                !file.mimeType.startsWith('text/') &&
                file.mimeType !== 'application/json'
            )
                throw new Error(
                    'Choose a Google Doc, Slides deck, or text file. Export Sheets to CSV before importing.'
                );
            const text = await executeGoogleOperation(
                exportable ? 'drive.exportText' : 'drive.readText',
                { fileId: file.id }
            );
            if (typeof text !== 'string') throw new Error('The file did not return readable text.');
            await addDocument(getIndexedDbFileSystem(), {
                id: `drive-${file.id}`,
                title: file.name,
                text,
                sourceUrl: `https://drive.google.com/file/d/${file.id}/view`,
                updatedAt: new Date().toISOString(),
            });
            this.documents = await listDocuments(getIndexedDbFileSystem());
        }, 'Drive document added. Select it again later to refresh its snapshot.');
    }
}
