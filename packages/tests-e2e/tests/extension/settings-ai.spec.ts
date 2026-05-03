import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';
import type { BrowserContext, Worker } from '@playwright/test';

/**
 * MV3 service workers are lazy — they may not be registered when the
 * persistent context first launches, so `context.serviceWorkers()[0]` is
 * often undefined at that moment. Poke the extension by opening a blank
 * extension page first, then wait for the SW to appear. Needed for the
 * two tests that seed chrome.storage BEFORE opening the settings app.
 */
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
    const existing = context.serviceWorkers();
    if (existing.length > 0) return existing[0];
    return context.waitForEvent('serviceworker', { timeout: 30_000 });
}

test.describe('@ext settings → AI internal hint', () => {
    test('hides hint when no internal gateway URL is configured', async ({ appPage }) => {
        const page = await appPage('settings');
        await page.getByRole('tab', { name: /AI/i }).first().click();
        await expect(page.locator('.internal-provider-hint')).toHaveCount(0);
    });

    test('shows hint + correct link when gateway URL is seeded', async ({ context, appPage }) => {
        const sw = await getServiceWorker(context);
        await sw.evaluate(async () =>
            chrome.storage.local.set({
                openai_url:
                    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1',
            })
        );
        const page = await appPage('settings');
        await page.getByRole('tab', { name: /AI/i }).first().click();
        const hint = page.locator('.internal-provider-hint');
        await expect(hint).toBeVisible();
        const link = hint.getByRole('link', {
            name: /LLM Provider Runtime guide.*opens in new tab/i,
        });
        await expect(link).toHaveAttribute(
            'href',
            'https://doc.sf-workbench.com/ai-agent/llm-provider-runtime'
        );
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /noopener/);
        await expect(link).toHaveAttribute('rel', /noreferrer/);
    });

    test('Settings AI tab has zero critical/serious axe violations', async ({ appPage }) => {
        const page = await appPage('settings');
        await page.getByRole('tab', { name: /AI/i }).first().click();
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            // Pre-existing SLDS base-components noise — lightning-vertical-navigation
            // renders role=list with a <slot> and role=listitem in a sibling shadow
            // root, which axe's structural ARIA rules cannot see across; and
            // lightning-button-icon stamps aria-label via aria-labelledby in a
            // separate shadow root that axe's button-name rule cannot trace.
            // Documented in docs/a11y-follow-ups.md.
            .disableRules([
                'aria-required-children',
                'aria-required-parent',
                'button-name',
            ])
            .analyze();
        const blocking = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
        );
        if (blocking.length > 0) {
            // eslint-disable-next-line no-console
            console.log(
                'Axe blocking violations on Settings AI:\n' +
                    blocking
                        .map(v => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
                        .join('\n')
            );
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(blocking, null, 2));
        }
        expect(blocking, 'critical/serious axe violations on Settings AI').toEqual([]);
    });

    test('Escape on hint link does not break focus', async ({ context, appPage }) => {
        const sw = await getServiceWorker(context);
        await sw.evaluate(async () =>
            chrome.storage.local.set({
                anthropic_url:
                    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock',
            })
        );
        const page = await appPage('settings');
        await page.getByRole('tab', { name: /AI/i }).first().click();
        await page.locator('.internal-provider-hint a').focus();
        await page.keyboard.press('Escape');
        await expect(page.locator('.internal-provider-hint a')).toBeFocused();
    });
});
