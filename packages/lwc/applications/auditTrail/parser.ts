export type AuditCategory = 'profile' | 'permset' | 'user' | 'package' | 'metadata' | 'other';

export interface ParsedAuditDisplay {
    category: AuditCategory;
    entity: string | null;
}

const MAX_ENTITY_LENGTH = 80;

// Ordered: first-match-wins.
// - metadata runs first so "for field X on profile Y" classifies as metadata, not profile.
// - permset runs before profile because "permission set ... profile ..." appears frequently.
const PATTERNS: Array<{ category: AuditCategory; regex: RegExp }> = [
    {
        category: 'metadata',
        // Either "Field-level security..." (no entity) or "for field Account.Revenue__c".
        regex: /(?:field-level security|for field\s+([\w.]+))/i,
    },
    {
        category: 'permset',
        regex: /permission set(?:\s+group)?\s+"?([^":,]+)"?/i,
    },
    {
        category: 'profile',
        regex: /\bprofile\s+"?([^":,]+)"?/i,
    },
    {
        category: 'package',
        regex: /\bpackage\s+"?([^":,]+)"?/i,
    },
    {
        category: 'user',
        regex: /\buser[:\s]+"?([\w.@+\-]+)"?/i,
    },
];

function cleanEntity(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim().replace(/[\s.,;:]+$/, '');
    if (!trimmed) return null;
    return trimmed.length > MAX_ENTITY_LENGTH ? trimmed.slice(0, MAX_ENTITY_LENGTH) : trimmed;
}

export function parseAuditDisplay(display: string | null | undefined): ParsedAuditDisplay {
    if (!display) return { category: 'other', entity: null };
    for (const { category, regex } of PATTERNS) {
        const match = regex.exec(display);
        if (!match) continue;
        const entity = cleanEntity(match[1]);
        return { category, entity };
    }
    return { category: 'other', entity: null };
}
