/**
 * Pure helpers for the GraphQL Explorer "Keyboard Shortcuts" modal.
 *
 * Kept free of LWC / DOM imports so they can be unit-tested with `node --test`.
 */

export interface ShortcutLabels {
    /** Label shown on macOS (e.g. "⌘↵"). */
    mac: string;
    /** Label shown on every other platform (e.g. "Ctrl+Enter"). */
    other: string;
}

export interface ShortcutRow {
    /** Stable identifier used as template key. */
    id: string;
    /** Platform-aware shortcut labels. */
    labels: ShortcutLabels;
    /** Human-readable description of what the shortcut does. */
    action: string;
    /** True when the shortcut is listed for reference but not yet wired up. */
    disabled?: boolean;
}

export interface FormattedShortcutRow {
    id: string;
    shortcut: string;
    action: string;
    disabled: boolean;
    rowClass: string;
}

/**
 * Pick the platform-appropriate label for a shortcut.
 *
 * @param labels  Mac / non-mac label pair.
 * @param isMac   True when the host is running macOS.
 */
export function formatShortcut(labels: ShortcutLabels, isMac: boolean): string {
    return isMac ? labels.mac : labels.other;
}

/**
 * Detect whether the host platform is macOS.
 *
 * Uses `navigator.userAgentData.platform` when available (modern Chromium)
 * and falls back to the legacy `navigator.platform` string. Accepts an
 * optional navigator-like override to make the function testable.
 */
export function detectIsMac(nav?: {
    userAgentData?: { platform?: string };
    platform?: string;
}): boolean {
    const n: any =
        nav ??
        (typeof navigator !== 'undefined' ? (navigator as unknown as Record<string, unknown>) : {});
    const uaPlatform: string | undefined = n?.userAgentData?.platform;
    const legacyPlatform: string | undefined = n?.platform;
    const raw = (uaPlatform || legacyPlatform || '').toLowerCase();
    return raw.includes('mac');
}

/** Static list of shortcuts rendered by the modal. */
export const SHORTCUTS: ShortcutRow[] = [
    {
        id: 'run',
        labels: { mac: '⌘↵', other: 'Ctrl+Enter' },
        action: 'Run query',
    },
    {
        id: 'toggle-variables',
        labels: { mac: '⌘B', other: 'Ctrl+B' },
        action: 'Toggle variables',
    },
    {
        id: 'save',
        labels: { mac: '⌘S', other: 'Ctrl+S' },
        action: 'Save (not supported)',
        disabled: true,
    },
    {
        id: 'open-shortcuts',
        labels: { mac: '⌘K', other: 'Ctrl+K' },
        action: 'Open this shortcuts list',
    },
    {
        id: 'find',
        labels: { mac: '⌘F', other: 'Ctrl+F' },
        action: 'Search the response (inside Monaco)',
    },
    {
        id: 'indent',
        labels: { mac: 'Tab / Shift+Tab', other: 'Tab / Shift+Tab' },
        action: 'Indent / outdent in editor',
    },
];

/**
 * Map the static shortcut list to a template-ready shape. Exposed as a pure
 * helper so tests can assert on the rendered rows without needing an LWC
 * runtime.
 */
export function buildShortcutRows(
    isMac: boolean,
    rows: ShortcutRow[] = SHORTCUTS
): FormattedShortcutRow[] {
    return rows.map(row => ({
        id: row.id,
        shortcut: formatShortcut(row.labels, isMac),
        action: row.action,
        disabled: Boolean(row.disabled),
        rowClass: row.disabled ? 'shortcut-row shortcut-row_disabled' : 'shortcut-row',
    }));
}
