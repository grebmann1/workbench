import { store } from 'host-api/store';
import LightningConfirm from 'lightning/confirm';
import { UI } from 'soql/slices';

export const escapeCsvValue = (separator: string, value: unknown) => {
    if (value == null) return ''; // Handle null or undefined values
    const stringValue = String(value); // Convert to string
    if (
        stringValue.includes(separator) ||
        stringValue.includes('"') ||
        stringValue.includes('\n')
    ) {
        // Escape double quotes by doubling them
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

/**
 * If the given tab has pending inline edits, prompt the user to discard them.
 * Returns true if it's safe to proceed (no edits, or user confirmed discard),
 * false if the user cancelled.
 */
export const confirmDiscardPendingEdits = async (
    uiState: any,
    tabId: string | undefined | null
): Promise<boolean> => {
    if (!tabId) return true;
    const tabBucket = uiState?.pendingEdits?.[tabId];
    if (!tabBucket) return true;
    const count = Object.values(tabBucket).reduce(
        (acc: number, entry: any) => acc + Object.keys(entry?.changes || {}).length,
        0
    );
    if (count === 0) return true;
    const ok = await LightningConfirm.open({
        variant: 'header',
        theme: 'warning',
        label: 'Unsaved changes',
        message: `You have ${count} unsaved ${count === 1 ? 'change' : 'changes'} on this tab. Discard ${count === 1 ? 'it' : 'them'}?`,
    });
    if (!ok) return false;
    store.dispatch(UI.reduxSlice.actions.clearEditsForTab({ tabId }));
    return true;
};

export const formatQueryWithComment = (query: string) => {
    return query
        .split('\n')
        .map(line => {
            const commentIndex = line.indexOf('//');
            if (commentIndex !== -1) {
                // Include everything before `//`, excluding the comment
                return line.slice(0, commentIndex).trim();
            }
            // Include the entire line if no `//` is found
            return line.trim();
        })
        .filter(line => line.length > 0) // Exclude empty lines
        .join(' '); // Join back into a single query string
};
