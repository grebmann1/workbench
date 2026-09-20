import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryContext, memoryPaths, readMemories, saveMemory } from '../memory';
import { addDocument, searchDocuments, removeDocument } from '../knowledge';
import { createMemoryTools } from '../tools';
import { filterToolsByModel } from '../../tools/modules/modelToolSupport';

function fileSystem() {
    const files = new Map<string, string>();
    return {
        files,
        exists: async (path: string) =>
            files.has(path) || [...files.keys()].some(key => key.startsWith(`${path}/`)),
        readFile: async (path: string) => {
            if (!files.has(path)) throw new Error('missing');
            return files.get(path)!;
        },
        writeFile: async (path: string, text: string) => {
            files.set(path, text);
        },
        mkdir: async () => {},
        rm: async (path: string) => {
            files.delete(path);
        },
        readdir: async (path: string) =>
            [...files.keys()]
                .filter(key => key.startsWith(`${path}/`))
                .map(key => key.slice(path.length + 1)),
    };
}
test('memory and document tools remain available after model filtering', () => {
    assert.deepEqual(
        filterToolsByModel(createMemoryTools(fileSystem(), {}), 'gpt-4o').map(tool => tool.name),
        ['read_memory', 'update_memory', 'search_documents']
    );
});
test('recall includes global and current org notes, preserves legacy notes, and excludes other orgs', async () => {
    const fs = fileSystem();
    fs.files.set('/workspace/memory/notes.md', 'Prefer explicit SOQL fields');
    fs.files.set('/workspace/memory/orgs/00D1/notes.md', 'Integration field: External_ID__c');
    fs.files.set('/workspace/memory/orgs/staging/schema.md', 'Legacy schema note');
    fs.files.set('/workspace/memory/orgs/00D2/notes.md', 'Do not reveal this other org');
    const context = await memoryContext(fs, { orgId: '00D1', alias: 'staging' });
    assert.match(context, /External_ID__c/);
    assert.match(context, /Legacy schema/);
    assert.doesNotMatch(context, /Do not reveal/);
    assert.match(context, /untrusted reference data/);
    assert.equal(
        memoryPaths({ orgId: '00D1', alias: 'renamed' })[1].path,
        '/workspace/memory/orgs/00D1/notes.md'
    );
});
test('editing and forgetting persist; arbitrary paths and oversized notes are rejected', async () => {
    const fs = fileSystem();
    const path = memoryPaths()[0].path;
    await saveMemory(fs, path, 'A dated preference');
    assert.equal((await readMemories(fs))[0].content, 'A dated preference');
    await saveMemory(fs, path, '');
    assert.doesNotMatch(await memoryContext(fs), /A dated preference/);
    await assert.rejects(saveMemory(fs, '/workspace/secrets', 'x'), /Choose a memory/);
    await assert.rejects(saveMemory(fs, path, 'x'.repeat(24001)), /too long/);
    await saveMemory(fs, path, 'Newer fact');
    await assert.rejects(saveMemory(fs, path, 'Stale edit', {}, ''), /changed since/);
    assert.equal((await readMemories(fs))[0].content, 'Newer fact');
});
test('large memory selects relevant facts and bounds injected context', async () => {
    const fs = fileSystem();
    fs.files.set(
        memoryPaths()[0].path,
        Array.from({ length: 500 }, (_, i) =>
            i === 499 ? 'The integration key is External_ID__c' : `Unrelated note ${i}`
        ).join('\n')
    );
    const context = await memoryContext(fs, {}, 'integration key');
    assert.match(context, /External_ID__c/);
    assert.ok(context.length < 14000);
});
test('knowledge returns actual line citations, finds text deep in a long line, and forgets deleted sources', async () => {
    const fs = fileSystem();
    await addDocument(fs, {
        id: 'org-guide',
        title: 'Org guide',
        text: 'Introduction\nThe integration key is External_ID__c\nUse explicit fields',
        updatedAt: '2026-09-20',
    });
    await addDocument(fs, {
        id: 'long',
        title: 'Long JSON',
        text: 'x'.repeat(5000) + ' needle',
        updatedAt: '2026-09-20',
    });
    const hits = await searchDocuments(fs, 'integration');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].lineStart, 1);
    assert.equal(hits[0].lineEnd, 3);
    assert.match(hits[0].text, /External_ID__c/);
    assert.match(await fs.readFile(hits[0].source), /External_ID__c/);
    assert.ok((await searchDocuments(fs, 'needle')).length > 0);
    await removeDocument(fs, 'org-guide');
    assert.equal(await fs.exists(hits[0].source), false);
    assert.equal((await searchDocuments(fs, 'integration')).length, 0);
    await assert.rejects(
        addDocument(fs, { id: '../escape', title: 'Bad', text: 'text', updatedAt: '' }),
        /Invalid/
    );
});
