import type { MemoryFileSystem } from './memory';
import {
    KNOWLEDGE_ROOT,
    DOCUMENT_LIMIT,
    DOCUMENT_COUNT_LIMIT,
    SEARCH_RESULT_LIMIT,
} from './constants';

export type KnowledgeDocument = {
    id: string;
    title: string;
    text: string;
    sourceUrl?: string;
    updatedAt: string;
};
const documentPath = (id: string) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid document ID.');
    return `${KNOWLEDGE_ROOT}/${id}.json`;
};
export async function listDocuments(fs: MemoryFileSystem): Promise<KnowledgeDocument[]> {
    if (!(await fs.exists(KNOWLEDGE_ROOT))) return [];
    const names = (await fs.readdir(KNOWLEDGE_ROOT))
        .filter(name => /^[a-zA-Z0-9_-]+\.json$/.test(name))
        .slice(0, DOCUMENT_COUNT_LIMIT);
    const documents: KnowledgeDocument[] = [];
    for (const name of names) {
        const raw = JSON.parse(await fs.readFile(`${KNOWLEDGE_ROOT}/${name}`));
        if (
            raw.id === name.slice(0, -5) &&
            typeof raw.title === 'string' &&
            typeof raw.text === 'string'
        )
            documents.push(raw);
    }
    return documents;
}
export async function addDocument(fs: MemoryFileSystem, document: KnowledgeDocument) {
    if (!document.title.trim() || !document.text.trim())
        throw new Error('The document must have a name and readable text.');
    if (document.text.length > DOCUMENT_LIMIT)
        throw new Error('Use a document smaller than 1 million characters.');
    const path = documentPath(document.id);
    if (!(await fs.exists(path)) && (await listDocuments(fs)).length >= DOCUMENT_COUNT_LIMIT)
        throw new Error('Remove a document before adding more (50 maximum).');
    if (
        document.sourceUrl &&
        !/^https:\/\/(docs\.google\.com|drive\.google\.com)\//.test(document.sourceUrl)
    )
        throw new Error('Unsupported document source URL.');
    await fs.mkdir(KNOWLEDGE_ROOT, { recursive: true });
    await fs.writeFile(path.replace(/\.json$/, '.txt'), document.text);
    await fs.writeFile(path, JSON.stringify(document));
}
export async function removeDocument(fs: MemoryFileSystem, id: string) {
    const path = documentPath(id);
    await fs.rm(path);
    const textPath = path.replace(/\.json$/, '.txt');
    if (await fs.exists(textPath)) await fs.rm(textPath);
}
export async function searchDocuments(fs: MemoryFileSystem, query: string) {
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [])].slice(0, 20);
    if (!terms.length) return [];
    const matches = [];
    for (const document of await listDocuments(fs)) {
        const lines = document.text.split('\n');
        for (let start = 0; start < lines.length; start += 12) {
            const block = lines.slice(start, start + 12).join('\n');
            for (let offset = 0; offset < block.length; offset += 2500) {
                const text = block.slice(offset, offset + 3000);
                const lower = text.toLowerCase();
                const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 2 : 0), 0);
                if (!score) continue;
                const lineStart = start + 1 + (block.slice(0, offset).match(/\n/g) || []).length;
                const lineEnd = lineStart + (text.match(/\n/g) || []).length;
                matches.push({
                    key: `${document.id}:${start}:${offset}`,
                    documentId: document.id,
                    title: document.title,
                    source:
                        document.sourceUrl || documentPath(document.id).replace(/\.json$/, '.txt'),
                    updatedAt: document.updatedAt,
                    lineStart,
                    lineEnd,
                    text,
                    score,
                });
            }
        }
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, SEARCH_RESULT_LIMIT);
}
