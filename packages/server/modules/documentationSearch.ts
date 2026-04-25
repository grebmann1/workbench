import { Charset, Document } from 'flexsearch';

type DocumentationEntry = {
    id: string | number;
    title: string;
    content: string;
    documentationId?: string;
};

type SearchArgs = {
    keywords?: string;
    filters?: string[];
};

/** FlexSearch result shape when `enrich: true` + `store: true` is used. */
type EnrichedSearchResult = {
    id: string | number;
    title?: string;
    doc?: DocumentationEntry;
};

/**
 * FlexSearch's generated `.d.ts` doesn't cover `.where()` and the dynamic
 * options shape we pass, so we keep the handle loosely-typed here and
 * re-narrow at each call site via `EnrichedSearchResult`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let docIndex: any = null;

export function initDocumentationIndex(docs: DocumentationEntry[]) {
    docIndex = new Document({
        worker: true,
        document: {
            id: 'id',
            store: true,
            index: [
                {
                    field: 'title',
                    tokenize: 'forward',
                    encoder: Charset.LatinBalance,
                },
                {
                    field: 'content',
                    tokenize: 'forward',
                    encoder: Charset.LatinBalance,
                },
            ],
            tag: [{ field: 'documentationId' }],
        },
    });
    for (const doc of docs) {
        docIndex.add(doc);
    }
}

export async function searchDocumentation({ keywords = '', filters = [] }: SearchArgs) {
    if (!docIndex) {
        return [];
    }
    let tag: Record<string, string[]> | undefined;
    if (filters && Array.isArray(filters) && filters.length > 0) {
        tag = { documentationId: filters };
    }
    let results: EnrichedSearchResult[] = [];
    if (keywords) {
        results = await docIndex.search({
            query: keywords,
            tag,
            suggest: true,
            enrich: true,
            merge: true,
        });
    } else {
        results = await docIndex.where(tag ?? {});
    }

    // Enhanced sorting: first by title match, then others alphabetically by title
    if (keywords) {
        const lowerKeywords = keywords.toLowerCase();
        const titleMatches: EnrichedSearchResult[] = [];
        const otherMatches: EnrichedSearchResult[] = [];
        for (const doc of results) {
            // doc.title for direct search, doc.doc.title for enriched search
            const title = doc.title || doc.doc?.title || '';
            if (title.toLowerCase().includes(lowerKeywords)) {
                titleMatches.push(doc);
            } else {
                otherMatches.push(doc);
            }
        }
        otherMatches.sort((a, b) => {
            const titleA = (a.title || a.doc?.title || '').toLowerCase();
            const titleB = (b.title || b.doc?.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });
        return [...titleMatches, ...otherMatches];
    }
    return results;
}
