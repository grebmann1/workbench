/**
 * Host slash-command registry.
 *
 * Slash commands are the user-facing surface shown by the agent publisher's
 * autocomplete popover (`/skill`, `/clear`, …). Entries come from three
 * tiers — built-ins defined in the publisher, manifest-declared entries
 * emitted by `tools/scripts/generate_application_manifest.js` into
 * `APPLICATION_SLASH_COMMANDS`, and runtime registrations made through
 * this module.
 *
 * Tier C (this module) exists so an app can add a slash command dynamically
 * — typically when the app itself decides at bootstrap whether a feature
 * should be exposed (feature flag, permission check, late-mounted extension).
 * Resolution / execution is delegated to `host-api/commands` via the entry's
 * `commandId`; this module only owns the *presentation* metadata.
 *
 * @typedef {Object} SlashCommand
 * @property {string} command
 * @property {string} description
 * @property {string} iconName
 * @property {boolean} [autoExecute]
 * @property {string} [commandId]
 * @property {string} [appId]
 */

const entries = new Map();
const listeners = new Set();

function notify() {
    for (const listener of Array.from(listeners)) {
        try {
            listener();
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.error('[host-api/slashCommands] listener threw', err);
            }
        }
    }
}

/**
 * Register a slash command. Returns an unregister callback.
 *
 * Re-registering the same `command` replaces the previous entry — same
 * policy as `host-api/commands` to keep hot-reload ergonomic. In dev a
 * warning is logged on replacement.
 *
 * @param {SlashCommand} entry
 * @returns {() => void}
 */
export function registerSlashCommand(entry) {
    if (!entry || typeof entry !== 'object') {
        throw new Error('registerSlashCommand: entry must be an object');
    }
    if (typeof entry.command !== 'string' || entry.command.length === 0) {
        throw new Error('registerSlashCommand: command must be a non-empty string');
    }
    if (typeof entry.description !== 'string' || entry.description.length === 0) {
        throw new Error(
            `registerSlashCommand: description for "${entry.command}" must be a non-empty string`
        );
    }
    if (typeof entry.iconName !== 'string' || entry.iconName.length === 0) {
        throw new Error(
            `registerSlashCommand: iconName for "${entry.command}" must be a non-empty string`
        );
    }
    const normalized = {
        ...entry,
        command: entry.command.toLowerCase(),
        autoExecute: entry.autoExecute !== false,
    };
    if (process.env.NODE_ENV !== 'production' && entries.has(normalized.command)) {
        // eslint-disable-next-line no-console
        console.warn(
            `[host-api/slashCommands] "${normalized.command}" already registered; replacing.`
        );
    }
    entries.set(normalized.command, normalized);
    notify();
    return () => {
        if (entries.get(normalized.command) === normalized) {
            entries.delete(normalized.command);
            notify();
        }
    };
}

/**
 * @param {string} command
 */
export function unregisterSlashCommand(command) {
    if (typeof command !== 'string') return;
    const key = command.toLowerCase();
    if (entries.delete(key)) {
        notify();
    }
}

/**
 * @returns {SlashCommand[]}
 */
export function getSlashCommands() {
    return Array.from(entries.values());
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onSlashCommandsChange(listener) {
    if (typeof listener !== 'function') {
        throw new Error('onSlashCommandsChange: listener must be a function');
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Test-only: drop all registrations and listeners. Not exported from the
 * public barrel.
 */
export function __resetSlashCommandsForTests() {
    entries.clear();
    listeners.clear();
}
