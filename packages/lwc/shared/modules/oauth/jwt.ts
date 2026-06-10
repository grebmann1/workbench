// Minimal, signature-free JWT payload reader. We only read the payload to pull the Codex
// account id — never to authenticate — so no verification library is needed (keeps this pure
// and target-agnostic).

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decode a JWT payload (the middle segment) without verifying the signature. Returns null
 *  on any malformed input. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
    if (!token || typeof token !== 'string') return null;
    const segments = token.split('.');
    if (segments.length < 2 || !segments[1]) return null;
    try {
        let base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
        base64 += '='.repeat((4 - (base64.length % 4)) % 4);
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);
        const parsed = JSON.parse(json);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** Extract the ChatGPT account id used for the `ChatGPT-Account-Id` header, with the same
 *  three-level fallback as the Codex CLI: top-level claim → the api.openai.com/auth
 *  namespace → the first organization's id. Tries the id_token first, then the access token,
 *  because the claim location varies. */
export function extractAccountId(
    idToken?: string | null,
    accessToken?: string | null
): string | null {
    for (const token of [idToken, accessToken]) {
        const payload = decodeJwtPayload(token);
        if (!payload) continue;

        const topLevel = payload.chatgpt_account_id;
        if (typeof topLevel === 'string' && topLevel) return topLevel;

        const authNamespace = payload['https://api.openai.com/auth'];
        if (isRecord(authNamespace)) {
            const nested = authNamespace.chatgpt_account_id;
            if (typeof nested === 'string' && nested) return nested;
        }

        const organizations = payload.organizations;
        if (Array.isArray(organizations) && organizations.length > 0) {
            const first = organizations[0];
            if (isRecord(first) && typeof first.id === 'string' && first.id) {
                return first.id;
            }
        }
    }
    return null;
}
