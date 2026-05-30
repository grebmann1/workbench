// setupUrl.ts
// Module: shared/sf/setupUrl
//
// Pure builder for Salesforce Setup deep-links. Used as a web fallback when
// `code.openMetadata` is unavailable (cross-app jumps from agentforce, graph
// clickthrough, etc.). No I/O, no side effects.
//
// URL shape choices:
// - Flow: Setup-list URL keyed by Flow API name. `flowBuilder.app` requires
//   `flowDefId` + `flowId` (Salesforce IDs), which we do not have on this
//   contract. The Setup-list URL with `address=/${name}` is the most reliable
//   name-based form. See `packages/lwc/shared/modules/utils/salesforceLinks.js`
//   and `packages/lwc/extension/overlay/item/item.ts` for precedent.
// - ApexClass: same Setup-list pattern, keyed by class name. Matches existing
//   `ApexClasses/page?address=%2F${id}` precedent in `overlay/item/item.ts`,
//   adapted to a name (URL-encoded).
// - BotDefinition: `lightning/setup/EinsteinCopilot/${id}/edit` matches the
//   existing pattern in `overlay/item/item.ts` (TYPE.AGENTFORCE) and is what
//   the classic Agent Builder uses.
// - Record: `${orgInstanceUrl}/${id}` — universal classic-style record URL,
//   Lightning auto-redirects to the right view.

export type SetupTarget =
    | { type: 'Flow'; name: string }
    | { type: 'ApexClass'; name: string }
    | { type: 'BotDefinition'; id: string }
    | { type: 'Record'; id: string };

const SF_ID_PATTERN = /^[a-zA-Z0-9]{15,18}$/;

function normalizeOrgInstanceUrl(orgInstanceUrl: string): string {
    if (typeof orgInstanceUrl !== 'string') {
        throw new TypeError('orgInstanceUrl must be a string.');
    }
    const trimmed = orgInstanceUrl.trim();
    if (!trimmed) {
        throw new Error('orgInstanceUrl must be a non-empty string.');
    }
    if (!/^https:\/\//i.test(trimmed)) {
        throw new Error(
            `orgInstanceUrl must start with "https://". Received: "${orgInstanceUrl}".`
        );
    }
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error(`orgInstanceUrl is not a valid URL: "${orgInstanceUrl}".`);
    }
    if (!parsed.host) {
        throw new Error(`orgInstanceUrl is missing a host: "${orgInstanceUrl}".`);
    }
    return trimmed.replace(/\/+$/, '');
}

function assertValidId(id: string, targetType: string): void {
    if (typeof id !== 'string') {
        throw new TypeError(`${targetType} id must be a string.`);
    }
    if (!SF_ID_PATTERN.test(id)) {
        throw new Error(
            `${targetType} id must be a 15- or 18-character Salesforce ID. Received: "${id}".`
        );
    }
}

function assertValidName(name: string, targetType: string): void {
    if (typeof name !== 'string') {
        throw new TypeError(`${targetType} name must be a string.`);
    }
    if (name.length === 0) {
        throw new Error(`${targetType} name must be a non-empty string.`);
    }
    if (name !== name.trim()) {
        throw new Error(
            `${targetType} name must not have leading or trailing whitespace. Received: "${name}".`
        );
    }
}

/**
 * Build a Salesforce Setup deep-link for the given target.
 *
 * @throws if `orgInstanceUrl` is not an `https://` URL, or if the target's
 *   `id`/`name` fails validation.
 */
export function buildSetupUrl(orgInstanceUrl: string, target: SetupTarget): string {
    const baseUrl = normalizeOrgInstanceUrl(orgInstanceUrl);

    switch (target.type) {
        case 'Flow': {
            assertValidName(target.name, 'Flow');
            // TODO: verify URL pattern — chose name-based Setup-list URL because
            // flowBuilder.app requires flowDefId+flowId which the contract does
            // not expose.
            return `${baseUrl}/lightning/setup/Flows/page?address=%2F${encodeURIComponent(target.name)}`;
        }
        case 'ApexClass': {
            assertValidName(target.name, 'ApexClass');
            // TODO: verify URL pattern — name-based Setup-list URL. Existing
            // codebase uses id-based form; name-based is acceptable for v1.
            return `${baseUrl}/lightning/setup/ApexClasses/page?address=%2F${encodeURIComponent(target.name)}`;
        }
        case 'BotDefinition': {
            assertValidId(target.id, 'BotDefinition');
            // Matches existing overlay/item.ts TYPE.AGENTFORCE pattern.
            return `${baseUrl}/lightning/setup/EinsteinCopilot/${target.id}/edit`;
        }
        case 'Record': {
            assertValidId(target.id, 'Record');
            // Universal classic-style record URL; Lightning redirects to the
            // appropriate view for the record's sObject.
            return `${baseUrl}/${target.id}`;
        }
        default: {
            const exhaustive: never = target;
            throw new Error(
                `Unknown SetupTarget type: ${JSON.stringify(exhaustive satisfies never)}.`
            );
        }
    }
}
