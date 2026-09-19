import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension build');

async function openSettings(context: BrowserContext, extensionId: string, models = true) {
    // Exercise the real worker + PKCE/callback/storage flow against isolated provider fixtures.
    context.setDefaultTimeout(15000);
    await context.route('https://**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'auth.openai.com' || url.hostname === 'auth.x.ai') {
            return route.fulfill({
                contentType: 'text/html',
                body: '<h1>Provider sign-in fixture</h1>',
            });
        }
        if (url.pathname.endsWith('/models') || url.pathname.endsWith('/language-models')) {
            return route.fulfill({
                json: {
                    data: models
                        ? [
                              {
                                  id: url.hostname === 'api.x.ai' ? 'grok-fixture' : 'gpt-fixture',
                                  object: 'model',
                              },
                          ]
                        : [],
                },
            });
        }
        return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await worker.evaluate(() => {
        // chrome.windows.create starts navigation before Playwright can attach its route.
        // Open the real popup blank, record its requested URL, then navigate via Playwright.
        const createWindow = chrome.windows.create.bind(chrome.windows);
        chrome.windows.create = async options => {
            await chrome.storage.session.set({ fixture_authorize_url: options.url });
            return createWindow({ ...options, url: 'about:blank' });
        };
        globalThis.fetch = async (input, init) => {
            const url = String(input);
            if (url.endsWith('/.well-known/openid-configuration')) {
                return Response.json({
                    authorization_endpoint: 'https://auth.x.ai/oauth/authorize',
                    token_endpoint: 'https://auth.x.ai/oauth/token',
                });
            }
            if (url.endsWith('/oauth/token')) {
                const body = new URLSearchParams(String(init?.body));
                if (!body.get('code_verifier') || !body.get('code'))
                    return new Response('', { status: 400 });
                return Response.json({
                    access_token: 'fixture-access',
                    refresh_token: 'fixture-refresh',
                    expires_in: 3600,
                    token_type: 'Bearer',
                });
            }
            return Response.json({});
        };
    });
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    return { page, worker };
}

async function apiField(page: Page, provider = 'Anthropic') {
    const settings = page.locator('agent-ai-settings');
    const group = settings
        .locator('.settings-disclosure')
        .filter({ hasText: 'API keys & endpoints' });
    if (!(await group.evaluate(el => (el as HTMLDetailsElement).open))) {
        await group.locator(':scope > summary').click();
    }
    const row = group
        .locator('.api-provider')
        .filter({ has: page.locator('summary span', { hasText: provider }) });
    if (!(await row.evaluate(el => (el as HTMLDetailsElement).open)))
        await row.locator(':scope > summary').click();
    return row.locator('lightning-input[data-key$="_key"] input');
}

for (const provider of [
    { name: 'ChatGPT', id: 'codex', key: 'openai', manual: false },
    { name: 'Grok', id: 'xai', key: 'grok', manual: true },
]) {
    test(`${provider.name} login persists through Save and sign-out preserves drafts`, async ({
        context,
        extensionId,
    }, testInfo) => {
        const { page, worker } = await openSettings(context, extensionId);
        const card = page.getByRole('region', { name: provider.name, exact: true });
        await expect(
            card.getByRole('button', { name: `Sign in with ${provider.name}` })
        ).toBeVisible();
        if (!provider.manual)
            await page.screenshot({ path: testInfo.outputPath('settings-connections.png') });
        await page.locator('.mcp-settings > summary').click();
        const mcp = page.getByLabel('MCP server configuration', { exact: true });
        const mcpDraft = JSON.stringify({
            mcpServers: { docs: { url: 'https://tools.fixture/mcp', enabled: false } },
        });
        await mcp.fill(mcpDraft);
        const key = await apiField(page);
        await key.fill('draft-api-key');
        // Blur/change before launching the popup (the same sequence as user interaction).
        const popupPromise = context.waitForEvent('page');
        await card.getByRole('button', { name: `Sign in with ${provider.name}` }).click();
        const popup = await popupPromise;
        const authorizeUrl = await worker.evaluate(
            async () =>
                (await chrome.storage.session.get('fixture_authorize_url')).fixture_authorize_url
        );
        await popup.goto(authorizeUrl);
        await expect(
            popup.getByRole('heading', { name: 'Provider sign-in fixture' })
        ).toBeVisible();
        const pending = await worker.evaluate(
            async () => (await chrome.storage.session.get('oauth_pending_flow')).oauth_pending_flow
        );
        expect(pending.provider).toBe(provider.id);
        const authorization = new URL(popup.url());
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
        expect(authorization.searchParams.get('state')).toBe(pending.state);
        expect(authorization.searchParams.get('code_challenge')).toBeTruthy();
        if (provider.manual) {
            await card.getByText('Having trouble returning?', { exact: true }).click();
            const input = card.getByLabel('Authorization code or callback URL');
            await input.fill(`${pending.redirectUri}?code=fixture-code&state=wrong-state`);
            await card.getByRole('button', { name: 'Complete sign-in' }).click();
            await expect(page.locator('.connection-error')).toContainText('state mismatch');
            await input.fill(`${pending.redirectUri}?code=fixture-code&state=${pending.state}`);
            await card.getByRole('button', { name: 'Complete sign-in' }).click();
        } else {
            await popup
                .goto(`${pending.redirectUri}?code=fixture-code&state=${pending.state}`)
                .catch(() => {});
            await expect(popup).toHaveURL(
                `chrome-extension://${extensionId}/views/oauth-success.html`
            );
            await expect(
                popup.getByRole('heading', { name: 'Signed in to Workbench' })
            ).toBeVisible();
        }
        await expect(card.getByText('Connected', { exact: true })).toBeVisible();
        await expect(card.getByText('1 model available')).toBeVisible();
        await expect(key).toHaveValue('draft-api-key');
        await expect(mcp).toHaveValue(mcpDraft);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        const connected = await page.evaluate(async () => chrome.storage.local.get(null));
        expect(connected.llm_provider_configs[provider.key].authMode).toBe('oauth');
        expect(connected.llm_provider_configs[provider.key].oauth.access).toBe('fixture-access');
        expect(connected.anthropic_key).toBe('draft-api-key');
        expect(connected.mcp_servers[0].url).toBe('https://tools.fixture/mcp');
        await key.fill('updated-draft-key');
        await card.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(
            card.getByRole('button', { name: `Sign in with ${provider.name}` })
        ).toBeVisible();
        await expect(key).toHaveValue('updated-draft-key');
        await expect(mcp).toHaveValue(mcpDraft);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        const disconnected = await page.evaluate(async () => chrome.storage.local.get(null));
        expect(disconnected.llm_provider_configs[provider.key].authMode).toBe('apiKey');
        expect(disconnected.llm_provider_configs[provider.key].oauth).toBeUndefined();
        expect(disconnected.anthropic_key).toBe('updated-draft-key');
        expect(
            await page
                .locator('.chat-settings-body')
                .evaluate(el => el.scrollWidth <= el.clientWidth)
        ).toBe(true);
    });
}

test('failed callback leaves no connection and can restart sign-in', async ({
    context,
    extensionId,
}) => {
    const { page, worker } = await openSettings(context, extensionId);
    const card = page.getByRole('region', { name: 'ChatGPT', exact: true });
    const popupPromise = context.waitForEvent('page');
    await card.getByRole('button', { name: 'Sign in with ChatGPT' }).click();
    const popup = await popupPromise;
    const pending = await worker.evaluate(
        async () => (await chrome.storage.session.get('oauth_pending_flow')).oauth_pending_flow
    );
    await popup.goto(`${pending.redirectUri}?code=fixture-code&state=invalid`).catch(() => {});
    await expect(page.locator('.connection-error')).toContainText('state mismatch');
    await expect(card.getByText('Connected', { exact: true })).toHaveCount(0);
    expect(
        await worker.evaluate(
            async () => (await chrome.storage.session.get('oauth_pending_flow')).oauth_pending_flow
        )
    ).toBeUndefined();
    const retry = context.waitForEvent('page');
    await card.getByRole('button', { name: 'Try sign-in again' }).click();
    const retryPopup = await retry;
    await expect(page.locator('.connection-error')).toHaveCount(0);
    const retryPending = await worker.evaluate(
        async () => (await chrome.storage.session.get('oauth_pending_flow')).oauth_pending_flow
    );
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await retryPopup
        .goto(`${retryPending.redirectUri}?code=fixture-code&state=${retryPending.state}`)
        .catch(() => {});
    await expect(retryPopup).toHaveURL(
        `chrome-extension://${extensionId}/views/oauth-success.html`
    );
    await expect(page.getByText('Signed in.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await expect(card.getByText('Connected', { exact: true })).toBeVisible();
});

test('manual model fallback is saved immediately and survives settings Save at 320px', async ({
    context,
    extensionId,
}, testInfo) => {
    const { page, worker } = await openSettings(context, extensionId, false);
    await page.setViewportSize({ width: 320, height: 850 });
    const card = page.getByRole('region', { name: 'Grok', exact: true });
    const popupPromise = context.waitForEvent('page');
    await card.getByRole('button', { name: 'Sign in with Grok' }).click();
    await popupPromise;
    await card.getByText('Having trouble returning?', { exact: true }).click();
    await card
        .getByLabel('Authorization code or callback URL')
        .fill('fixture-authorization-code-1234567890');
    await card.getByRole('button', { name: 'Complete sign-in' }).click();
    const model = card.getByLabel('Model name', { exact: true });
    await expect(model).toBeVisible();
    const key = await apiField(page);
    await key.fill('draft-api-key');
    await model.fill('grok-custom-fixture');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect
        .poll(async () =>
            worker.evaluate(
                async () =>
                    (await chrome.storage.local.get('llm_provider_configs')).llm_provider_configs
                        .grok.customModel
            )
        )
        .toBe('grok-custom-fixture');
    await card.getByRole('button', { name: 'Refresh models' }).click();
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await expect(card.getByLabel('Model name', { exact: true })).toHaveValue('grok-custom-fixture');
    await expect(card.getByText('Custom model', { exact: true })).toBeVisible();
    await expect(
        card.getByText('Using your SuperGrok subscription.', { exact: true })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('settings-connected-narrow.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
    );
});
