import { lowerCaseKey } from 'host-api/utils';

type DescribeEntry = Record<string, any>;

const normalizeEntries = (entries: unknown): DescribeEntry[] =>
    Array.isArray(entries) ? entries.filter(Boolean) : [];

const withLegacyFallback = (
    entries: DescribeEntry[],
    legacyEntry: DescribeEntry | null | undefined
): DescribeEntry[] => {
    if (!legacyEntry) return entries;
    if (
        entries.some(
            entry =>
                lowerCaseKey(entry?.name) === lowerCaseKey(legacyEntry?.name) &&
                entry?.useToolingApi === legacyEntry?.useToolingApi
        )
    ) {
        return entries;
    }
    return [...entries, legacyEntry];
};

const pickPreferredEntry = (
    entries: DescribeEntry[],
    useToolingApi?: boolean | null
): DescribeEntry | null => {
    if (!entries.length) return null;
    if (useToolingApi === true) {
        return entries.find(entry => entry?.useToolingApi === true) || entries[0];
    }
    const standardEntry = entries.find(entry => entry?.useToolingApi !== true);
    return standardEntry || entries[0];
};

export const getDescribeEntriesByName = (
    describeState: Record<string, any> | null | undefined,
    sobjectName: string | null | undefined
): DescribeEntry[] => {
    if (!describeState || !sobjectName) return [];
    const key = lowerCaseKey(sobjectName);
    const entries = normalizeEntries(describeState?.nameEntriesMap?.[key]);
    return withLegacyFallback(entries, describeState?.nameMap?.[key]);
};

export const getDescribeByName = ({
    describeState,
    sobjectName,
    useToolingApi,
}: {
    describeState: Record<string, any> | null | undefined;
    sobjectName: string | null | undefined;
    useToolingApi?: boolean | null;
}): DescribeEntry | null => {
    const entries = getDescribeEntriesByName(describeState, sobjectName);
    return pickPreferredEntry(entries, useToolingApi);
};

export const getDescribeByPrefix = ({
    describeState,
    idPrefix,
    useToolingApi,
}: {
    describeState: Record<string, any> | null | undefined;
    idPrefix: string | null | undefined;
    useToolingApi?: boolean | null;
}): DescribeEntry | null => {
    if (!describeState || !idPrefix) return null;
    const key = lowerCaseKey(idPrefix);
    const entries = withLegacyFallback(
        normalizeEntries(describeState?.prefixEntriesMap?.[key]),
        describeState?.prefixMap?.[key]
    );
    return pickPreferredEntry(entries, useToolingApi);
};

export const getAllDescribeEntries = (
    describeState: Record<string, any> | null | undefined
): DescribeEntry[] => {
    if (!describeState) return [];
    const nameEntriesMap = describeState?.nameEntriesMap || {};
    const entries = Object.values(nameEntriesMap).flatMap(group => normalizeEntries(group));
    if (entries.length === 0) {
        return Object.values(describeState?.nameMap || {});
    }
    return entries;
};
