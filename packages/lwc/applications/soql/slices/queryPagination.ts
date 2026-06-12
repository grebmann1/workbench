/**
 * Pure helpers for SOQL `queryMore` pagination.
 *
 * Kept free of the `host-api/store` barrel so they can be unit-tested in
 * isolation (the slice itself pulls in Redux + core wiring that the node
 * test runner can't cheaply load).
 */

/** Minimal shape of a jsforce query result we care about for pagination. */
export interface QueryPage {
    totalSize?: number;
    done?: boolean;
    nextRecordsUrl?: string | null;
    records?: Array<Record<string, any>>;
    [key: string]: any;
}

/**
 * Merge a freshly fetched `queryMore` page into the existing query result.
 *
 * Appends the new page's records to the ones already loaded and carries over
 * the latest `done` / `nextRecordsUrl` cursor. `totalSize` stays the value
 * Salesforce reported for the whole result set — it does not shrink as pages
 * arrive. Returns a new object; never mutates either input.
 */
export function mergeQueryPage(existing: QueryPage | null | undefined, page: QueryPage): QueryPage {
    const existingRecords = existing?.records ?? [];
    const pageRecords = page?.records ?? [];
    return {
        ...existing,
        ...page,
        totalSize: existing?.totalSize ?? page?.totalSize ?? existingRecords.length,
        records: [...existingRecords, ...pageRecords],
        // jsforce omits nextRecordsUrl once the cursor is exhausted; normalise to null.
        nextRecordsUrl: page?.nextRecordsUrl ?? null,
        done: page?.done ?? !page?.nextRecordsUrl,
    };
}

export interface PaginationSummary {
    /** Records currently held in the store for this tab. */
    loaded: number;
    /** Total records the server reports for the whole result set. */
    total: number;
    /** True when more records can be fetched (a cursor is present). */
    hasMore: boolean;
}

/**
 * Derive the loaded / total / hasMore counts the UI needs from a query result.
 * `hasMore` is driven purely by the presence of a cursor so a result whose
 * `totalSize` is an estimate (reports, aggregate queries) still paginates
 * correctly.
 */
export function getPaginationSummary(data: QueryPage | null | undefined): PaginationSummary {
    const loaded = data?.records?.length ?? 0;
    const total = data?.totalSize ?? loaded;
    const hasMore = Boolean(data?.nextRecordsUrl);
    return { loaded, total, hasMore };
}
