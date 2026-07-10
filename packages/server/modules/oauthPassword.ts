import type { Application, Request, Response } from 'express';
import jsforce from 'jsforce';

/**
 * Server-side broker for the OAuth 2.0 Username-Password flow.
 *
 * The client cannot run this grant itself: it requires the Connected App's
 * `client_secret`, which is intentionally kept server-side only (the client
 * bundle ships `clientId` but never the secret — see `/config`). This mirrors
 * the `/chrome/callback` code-exchange endpoint.
 *
 * This replaces the retiring SOAP `login()` call for Username/Password auth.
 * `login.salesforce.com` blocks the password grant, so callers must pass their
 * org's My Domain / instance login URL.
 */

// Production Salesforce domains (mirrors modules/proxy.ts).
const SF_PROD_ENDPOINT_REGEXP =
    /^https:\/\/[a-zA-Z0-9.-]+\.(force|salesforce|cloudforce|database)\.com\/?$/;
// Dev/orgfarm/my.salesforce-com.crm.dev style domains (with optional port).
const SF_DEV_ENDPOINT_REGEXP =
    /^https:\/\/(?:[a-zA-Z0-9-]+\.)?(?:my|login)\.salesforce-com\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+\.crm\.dev(?::\d+)?\/?$/;

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Strip any path/query so only the origin is used as the OAuth login URL. */
export function normalizeLoginUrl(rawLoginUrl: unknown): string | null {
    const raw = normalizeString(rawLoginUrl);
    if (!raw) {
        return null;
    }
    try {
        return new URL(raw).origin;
    } catch {
        return null;
    }
}

/** Only allow the password grant against real Salesforce login/instance hosts. */
export function isAllowedLoginUrl(loginUrl: string): boolean {
    return SF_PROD_ENDPOINT_REGEXP.test(loginUrl) || SF_DEV_ENDPOINT_REGEXP.test(loginUrl);
}

type OAuth2Factory = (loginUrl: string) => {
    authenticate: (
        username: string,
        password: string
    ) => Promise<{
        access_token?: string;
        instance_url?: string;
        refresh_token?: string;
        id?: string;
    }>;
};

const defaultOAuth2Factory: OAuth2Factory = loginUrl =>
    // jsforce's OAuth2 exposes authenticate() at runtime; its typings omit it.
    new jsforce.OAuth2({
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        loginUrl,
    }) as unknown as ReturnType<OAuth2Factory>;

/**
 * Register `POST /oauth2/password`.
 * Body: `{ username, password, loginUrl }`.
 * Returns `{ access_token, instance_url, refresh_token, id, issued_at }`.
 */
export default function oauthPassword(
    app: Application,
    { path = '/oauth2/password', oauth2Factory = defaultOAuth2Factory } = {}
) {
    app.options(path, (_req: Request, res: Response) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.sendStatus(200);
    });

    app.post(path, async (req: Request, res: Response) => {
        res.set('Access-Control-Allow-Origin', '*');

        if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
            return res.status(500).json({ error: 'OAuth client is not configured on the server.' });
        }

        const username = normalizeString(req.body?.username);
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const loginUrl = normalizeLoginUrl(req.body?.loginUrl);

        if (!username || !password || !loginUrl) {
            return res.status(400).json({ error: 'username, password and loginUrl are required.' });
        }
        if (!isAllowedLoginUrl(loginUrl)) {
            return res
                .status(400)
                .json({ error: `loginUrl is not a valid Salesforce host: ${loginUrl}` });
        }

        try {
            const oauth2 = oauth2Factory(loginUrl);
            const result = await oauth2.authenticate(username, password);
            if (!result?.access_token || !result?.instance_url) {
                return res
                    .status(502)
                    .json({ error: 'OAuth token exchange returned no access token.' });
            }
            return res.json({
                access_token: result.access_token,
                instance_url: result.instance_url,
                refresh_token: result.refresh_token || null,
                id: result.id || null,
                issued_at: Date.now(),
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'OAuth password flow failed.';
            // Salesforce returns error names like `invalid_grant` on the Error.name.
            const name = e instanceof Error ? e.name : undefined;
            console.error('[oauth2/password]', name || '', message);
            return res.status(400).json({ error: message, code: name || null });
        }
    });
}
