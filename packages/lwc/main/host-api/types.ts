/**
 * Public type surface for extension Apps.
 *
 * RootState / AppDispatch come from the live core store so extensions get
 * precise types for the current set of static slices + whatever they
 * inject at runtime. AppManifest and ContributionPoint are placeholders
 * for the manifest-driven registry work (PR 3).
 */
import type { Reducer } from '@reduxjs/toolkit';

export type { RootState, AppDispatch } from 'core/store';
export type { Reducer };

/**
 * Declarative description of an extension App. Consumed by the build-time
 * manifest aggregator (tools/scripts/generate_application_manifest.js) and
 * the generated registry. Mirrors the shape authored in each App's
 * `<name>.manifest.json`.
 *
 * `reducerKey` is reserved for PR 4 when slices move with their App; it's
 * accepted today but ignored by the generator.
 */
export interface AppManifest {
    /** Stable unique id, e.g. "soql". Used as the default reducer key. */
    id: string;
    /** Module specifier, e.g. "soql/app". Must match the LWC alias. */
    name: string;
    /** Display name shown in the launcher and tab bar. */
    label: string;
    /** Short label for narrow tabs. */
    shortName: string;
    /** One-line description for the launcher card. */
    description: string;
    /** URL path segment, e.g. "soql" → /soql. */
    path: string;
    /** SLDS icon for the launcher quick action, e.g. "standard:data_model". */
    quickActionIcon: string;
    /** Optional SLDS icon for the left nav. Defaults to quickActionIcon when omitted. */
    menuIcon?: string;
    /** Category: "explorer" | "developer" | "data" | ... — used for grouping/styling. */
    type: string;
    /** Menu group key (must match one of APPLICATION_MENU_GROUPS). */
    menuGroup: string;
    /** Sort order within the menu group. */
    menuOrder: number;
    /** Behaviour flags. */
    flags: AppManifestFlags;
    /**
     * Redux state key this App mounts its slice under. Reserved — honored
     * in PR 4 when feature slices move with their App. Must not collide
     * with a core static slice.
     */
    reducerKey?: string;
}

export interface AppManifestFlags {
    isFullHeight: boolean;
    isDeletable: boolean;
    isElectronOnly: boolean;
    isOfflineAvailable: boolean;
    isMenuVisible: boolean;
    isTabVisible: boolean;
    /** Optional — true when the App is Chrome-extension-only. */
    isChromeOnly?: boolean;
}

/**
 * Placeholder for extension contribution points (menus, commands, agent
 * tools). Concrete shape lands in PR 3; kept here so the import path is
 * stable for early adopters.
 */
export type ContributionPoint = never;
