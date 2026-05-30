/**
 * Pure content lookup for the agentforce empty/loading/error component.
 *
 * Centralizing the (kind × state) → copy table here keeps the LWC component
 * itself dumb (it just reads `title`, `message`, `iconName`) and lets us
 * cover all branches with a plain `node --test` suite — no LWC test
 * harness needed.
 *
 * Why this is app-local (not promoted to top-level shared/)
 * --------------------------------------------------------
 * Per the Platform architect's non-negotiable, shared/* requires a second
 * consumer before promotion. Today only agentforce uses these copy
 * decisions; if a second app needs the same kinds, we revisit.
 *
 * Permission-denied detection
 * ---------------------------
 * Engineer 7's `handleSliceError` does NOT expose `errorCode` on the slice
 * state — it stamps `state.error` with a classified human message like
 * "Permission denied — your user lacks access to this entity or field.".
 * For v1 we sniff that prefix to drive the permission-denied branch. If a
 * future engineer adds `state.errorCode`, swap the sniff for a code check.
 */

export type EmptyStateKind = 'inspector' | 'debugger' | 'dependencies' | 'editor';
export type EmptyStateVariant = 'no-data' | 'permission-denied' | 'feature-unavailable' | 'error';

export interface EmptyStateContent {
    title: string;
    message: string;
    /** SLDS standard icon name (e.g. `standard:bot`). */
    iconName: string;
    /** Optional icon variant for tinting (passed straight to lightning-icon). */
    iconVariant?: string;
}

const PERMISSION_DENIED_PREFIX = 'Permission denied';

/**
 * Signatures of a "feature not provisioned in this org" failure. These come
 * straight from the SOQL/REST layer (not Engineer 7's classifier) when the
 * org has no Agentforce / Einstein AI license, so the GenAi* / AiAuthoring*
 * entities don't exist for that org. Examples:
 *   - "INVALID_TYPE: Cannot use: AiAuthoringBundle in this organization"
 *   - "sObject type 'GenAiPlanner' is not supported."
 * In that case the raw error is noise to the user — we show a friendly
 * "Agentforce isn't enabled here" message instead.
 */
const FEATURE_UNAVAILABLE_SIGNATURES: RegExp[] = [
    /INVALID_TYPE/i,
    /cannot use:.*in this organization/i,
    /sobject type .* is not supported/i,
];

/**
 * Sniff the classified slice error to decide which empty-state branch to
 * render. Returns null if the message is empty.
 *
 * Precedence: permission-denied → feature-unavailable → generic error.
 */
export function deriveVariantFromError(error: string | null | undefined): EmptyStateVariant | null {
    if (!error) return null;
    if (error.startsWith(PERMISSION_DENIED_PREFIX)) return 'permission-denied';
    if (FEATURE_UNAVAILABLE_SIGNATURES.some(re => re.test(error))) return 'feature-unavailable';
    return 'error';
}

const TABLE: Record<
    EmptyStateKind,
    Record<EmptyStateVariant, Omit<EmptyStateContent, 'iconName'>>
> = {
    inspector: {
        'no-data': {
            title: 'No agents in this org',
            message: 'Create your first agent in Agent Builder to see it here.',
        },
        'permission-denied': {
            title: 'Insufficient permissions',
            message:
                'Your user needs read access to BotDefinition and GenAiPlugin to load the inspector tree.',
        },
        'feature-unavailable': {
            title: "Agentforce isn't enabled here",
            message:
                'This org doesn’t have Agentforce (Einstein AI) set up, so there are no agents to load. Enable Agentforce in Setup, then refresh.',
        },
        error: {
            title: "Couldn't load agents",
            message: 'Something went wrong fetching agents from this org.',
        },
    },
    debugger: {
        'no-data': {
            title: 'No conversations yet',
            message: 'Try chatting with this agent first — interactions will appear here.',
        },
        'permission-denied': {
            title: 'Insufficient permissions',
            message: 'Your user needs read access to GenAiInteraction to view conversation traces.',
        },
        'feature-unavailable': {
            title: "Agentforce isn't enabled here",
            message:
                'This org doesn’t have Agentforce (Einstein AI) set up, so there are no conversations to trace.',
        },
        error: {
            title: "Couldn't load conversations",
            message: 'Something went wrong fetching interactions from this org.',
        },
    },
    dependencies: {
        'no-data': {
            title: 'No dependencies found',
            message: 'This agent has no flows or Apex classes wired into its actions yet.',
        },
        'permission-denied': {
            title: 'Insufficient permissions',
            message:
                'Your user needs read access to FlowDefinition and ApexClass to render the dependency graph.',
        },
        'feature-unavailable': {
            title: "Agentforce isn't enabled here",
            message:
                'This org doesn’t have Agentforce (Einstein AI) set up, so there are no agents to map dependencies for.',
        },
        error: {
            title: "Couldn't render dependency graph",
            message: 'Something went wrong building the graph for this agent.',
        },
    },
    editor: {
        'no-data': {
            title: 'No script selected',
            message: 'Pick an AgentScript from the inspector to view its source.',
        },
        'permission-denied': {
            title: 'Insufficient permissions',
            message: 'Your user needs Metadata API access to retrieve AgentScript content.',
        },
        'feature-unavailable': {
            title: "Agentforce isn't enabled here",
            message:
                'This org doesn’t have Agentforce (Einstein AI) set up, so there are no AgentScripts to open.',
        },
        error: {
            title: "Couldn't load script content",
            message: 'Something went wrong retrieving the AgentScript from this org.',
        },
    },
};

const ICON_TABLE: Record<EmptyStateKind, Record<EmptyStateVariant, string>> = {
    inspector: {
        'no-data': 'standard:bot',
        'permission-denied': 'standard:lock',
        'feature-unavailable': 'standard:einstein',
        error: 'standard:question_record',
    },
    debugger: {
        'no-data': 'standard:question_record',
        'permission-denied': 'standard:lock',
        'feature-unavailable': 'standard:einstein',
        error: 'standard:question_record',
    },
    dependencies: {
        'no-data': 'standard:flow',
        'permission-denied': 'standard:lock',
        'feature-unavailable': 'standard:einstein',
        error: 'standard:question_record',
    },
    editor: {
        'no-data': 'standard:apex',
        'permission-denied': 'standard:lock',
        'feature-unavailable': 'standard:einstein',
        error: 'standard:question_record',
    },
};

/**
 * Resolve title/message/icon for an `(kind, variant)` pair. If `variant ===
 * 'error'` and an `errorMessage` is provided, it overrides the canned copy
 * (so the slice's classified message surfaces directly to the user).
 */
export function getEmptyStateContent(
    kind: EmptyStateKind,
    variant: EmptyStateVariant,
    errorMessage?: string | null
): EmptyStateContent {
    const base = TABLE[kind][variant];
    const iconName = ICON_TABLE[kind][variant];
    const message =
        variant === 'error' && errorMessage && errorMessage.trim().length > 0
            ? errorMessage
            : base.message;
    return { title: base.title, message, iconName };
}
