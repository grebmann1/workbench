import dotenv from 'dotenv';
import express from 'express';
import jsforce from 'jsforce';
import qs from 'qs';

import announcements from './modules/announcements';
import { searchDocumentation } from './modules/documentationSearch';
import llmModels from './modules/llmModels';
import oauthPassword from './modules/oauthPassword';
import openaiProxy from './modules/openaiProxy';
import proxy from './modules/proxy';

dotenv.config({ path: '.env.dev' });

const PORT = parseInt(process.env.PORT || '3000', 10);
const CHROME_ID = process.env.CHROME_ID || 'dncmipbpdapfjancbhmbodlhllapmagf';

type OAuthParams = {
    redirectUri?: string;
    loginUrl?: string;
    [key: string]: unknown;
};

const getOAuth2Instance = (params: OAuthParams) => {
    return new jsforce.OAuth2({
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        redirectUri: params.redirectUri,
        loginUrl: params.loginUrl,
    });
};

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/* CometD Proxy */
app.all('/cometd{/*splat}', proxy({ enableCORS: true }));
/* jsForce Proxy */
app.all('/proxy{/*splat}', proxy({ enableCORS: true }));
/* OpenAI Proxy */
openaiProxy(app, { path: '/openai/v1' });
llmModels(app);
announcements(app);
/* OAuth 2.0 Username-Password flow broker (replaces retiring SOAP login) */
oauthPassword(app);

app.get('/version', (_req, res) => {
    res.json({ version: process.env.npm_package_version });
});
app.get('/healthz', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: process.env.npm_package_version,
        commit: process.env.GIT_COMMIT_SHA || null,
    });
});
app.get('/config', (_req, res) => {
    res.json({
        clientId: process.env.CLIENT_ID,
        chromeId: CHROME_ID,
        googleClientId: process.env.GOOGLE_CLIENT_ID_WEB || null,
    });
});
app.get('/documentation/search', async (req, res) => {
    const keywords = (req.query.keywords as string) || '';
    const isFullTextSearch = !!req.query.isFullTextSearch;
    let filters: string[] = [];
    const rawFilters = req.query.filters;
    if (typeof rawFilters === 'string') {
        try {
            filters = JSON.parse(rawFilters);
        } catch {
            filters = [rawFilters];
        }
    }
    try {
        const results = await searchDocumentation({ keywords, filters });
        const mappedResults = results.map(({ id, title, doc }) => ({
            id,
            name: isFullTextSearch ? doc?.title : title,
            text: isFullTextSearch ? doc?.content : doc?.title,
            documentationId: doc?.documentationId,
        }));
        res.json(mappedResults);
    } catch (error) {
        console.error('Error searching documentation:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/* Chrome extension launcher — bare hits to the API root (e.g. `/?applicationName=release`)
 * come from nginx's /app → api.sf-workbench.com rewrite (see docker/nginx.conf.template).
 * Forward the user into the installed extension, preserving the query string. */
app.get('/', (req, res) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const search = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    res.redirect(`chrome-extension://${CHROME_ID}/views/app.html${search}`);
});

/* Chrome extension Salesforce OAuth callback — exchanges code and redirects back to extension */
app.get('/chrome/callback', async (req, res) => {
    const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
    const rawState = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
    if (!code || !rawState || typeof code !== 'string' || typeof rawState !== 'string') {
        return res.status(400).send('Missing code or state');
    }
    const states = rawState.split('#');
    const params = qs.parse(states[1] || '');
    try {
        const conn = new jsforce.Connection({ oauth2: getOAuth2Instance(params) });
        const userInfo = await conn.authorize(code);
        res.redirect(
            `chrome-extension://${CHROME_ID}/callback.html#${qs.stringify({
                access_token: conn.accessToken,
                instance_url: conn.instanceUrl,
                refresh_token: conn.refreshToken,
                issued_at: Date.now(),
                id: userInfo.url,
                state: states[0],
            })}`
        );
    } catch (e) {
        console.error('[chrome/callback]', e);
        res.status(500).send('OAuth exchange failed');
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    console.log(`   http://localhost:${PORT}`);
});
