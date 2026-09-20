import { test, expect } from './fixtures';

test('navigation search finds task descriptions and recovers from empty results', async ({
    appPage,
}) => {
    const page = await appPage('home');
    const menu = page.locator('skeleton-menu');
    const search = menu.getByRole('searchbox', { name: 'Search tools and pages' });

    await search.fill('  DECODE components  ');
    await expect(menu.getByRole('button', { name: 'URL Encoder', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Text Compare', exact: true })).toBeHidden();
    await expect(menu.getByRole('status')).toHaveText('1 result');
    await expect(search).toBeFocused();

    await search.fill('no-such-tool');
    await expect(menu.getByRole('status')).toHaveText('No matching tools or pages');
    await expect(menu.getByRole('heading', { name: 'Build', exact: true })).toBeHidden();
    await menu.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(menu.getByRole('button', { name: 'Text Compare', exact: true })).toBeVisible();

    await search.fill('compare');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(menu.getByRole('button', { name: 'URL Encoder', exact: true })).toBeVisible();

    await search.fill('compare');
    await menu.getByRole('button', { name: 'Text Compare', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: /text compare/i })).toBeVisible();
});

test('collapsed navigation retains the active category and clears hidden filters', async ({
    appPage,
}) => {
    const page = await appPage('urlencoder');
    const menu = page.locator('skeleton-menu');
    const search = menu.getByRole('searchbox', { name: 'Search tools and pages' });
    await expect(menu.getByRole('button', { name: 'URL Encoder', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
    );
    await search.fill('URL');
    await menu.getByRole('button', { name: 'Collapse Navigation', exact: true }).click();
    const expand = menu.getByRole('button', { name: 'Expand Navigation', exact: true });
    await expect(expand).toBeFocused();
    await expect(
        menu.locator('.slds-nav-vertical__item.slds-is-active').filter({
            has: page.getByRole('button', { name: 'Utilities', exact: true }),
        })
    ).toBeVisible();
    await expect(
        page
            .locator('skeleton-header')
            .getByRole('button', { name: 'Expand navigation', exact: true })
    ).toBeVisible();

    await expand.click();
    await expect(search).toHaveValue('');
    await expect(menu.getByRole('button', { name: 'Text Compare', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'URL Encoder', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
    );
});

test('connection search distinguishes saved orgs from no results and resets filters', async ({
    appPage,
    extensionId,
}) => {
    const page = await appPage('connections');
    const connections = page.locator('connection-app');
    await expect(connections.getByText('No saved org yet.', { exact: false })).toBeVisible();
    await page.evaluate(async () => {
        // Use only a fake, credential-free record in this isolated test profile.
        // eslint-disable-next-line no-undef
        await chrome.storage.local.set({
            connections: [
                {
                    alias: 'UX Demo [QA]',
                    username: 'demo@example.invalid',
                    instanceUrl: 'https://example.invalid',
                    credentialType: 'REDIRECT',
                },
            ],
        });
    });
    await page.reload();
    const search = connections.getByRole('searchbox', { name: 'Search connections' });
    await expect(connections.getByRole('grid')).toContainText('UX Demo [QA]');
    await search.fill('unmatched');
    await expect(
        connections.getByRole('heading', { name: 'No matching connections' })
    ).toBeVisible();
    await expect(connections.getByText('No saved org yet.', { exact: false })).toBeHidden();
    await connections.getByText('Non-OrgFarm', { exact: true }).click();
    await connections.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(
        connections.getByRole('checkbox', { name: 'Non-OrgFarm', exact: true })
    ).toBeChecked();
    await expect(connections.getByRole('grid')).toContainText('UX Demo [QA]');

    await connections.getByText('Non-OrgFarm', { exact: true }).click();
    await expect(
        connections.getByRole('heading', { name: 'No matching connections' })
    ).toBeVisible();
    await connections.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.reload();
    await expect(connections.getByRole('grid')).toContainText('UX Demo [QA]');

    // Exercise the card view in the side panel, where matching text is highlighted.
    await page.goto(`chrome-extension://${extensionId}/views/default.html`);
    const panelSearch = page.getByRole('searchbox', { name: 'Search', exact: true });
    await expect(page.locator('connection-card')).toHaveCount(1);
    await panelSearch.fill('unmatched');
    await expect(page.locator('connection-card')).toHaveCount(0);
    await expect(
        connections.getByRole('heading', { name: 'No matching connections' })
    ).toBeVisible();
    const searchErrors: string[] = [];
    page.on('pageerror', error => searchErrors.push(error.message));
    await panelSearch.fill('[');
    await expect(page.locator('connection-card')).toHaveCount(1);
    await expect(
        connections.getByRole('heading', { name: 'No matching connections' })
    ).toBeHidden();
    expect(searchErrors).toEqual([]);
});
