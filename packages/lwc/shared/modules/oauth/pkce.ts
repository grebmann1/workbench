// PKCE (RFC 7636) helpers, target-agnostic via Web Crypto so the same code runs in the
// browser, the extension service worker, and Node/Electron. No Node-only APIs here.

/** base64url-encode raw bytes (no padding), per RFC 4648 §5. */
function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

export type PkcePair = {
    /** The high-entropy secret kept by the client and sent at token exchange. */
    verifier: string;
    /** base64url(SHA-256(verifier)) — sent on the authorize request. */
    challenge: string;
};

/** Generate an S256 PKCE verifier/challenge pair (verifier is 43 chars, within the
 *  RFC-mandated 43–128 range). */
export async function pkcePair(): Promise<PkcePair> {
    const verifier = base64UrlEncode(randomBytes(32));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64UrlEncode(new Uint8Array(digest));
    return { verifier, challenge };
}

/** A URL-safe random token for the OAuth `state` / `nonce` parameters. */
export function randomToken(byteLength = 16): string {
    return base64UrlEncode(randomBytes(byteLength));
}
