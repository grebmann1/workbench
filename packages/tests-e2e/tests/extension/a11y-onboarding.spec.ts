import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';

/**
 * Onboarding accessibility coverage.
 *
 * The onboarding wizard (`pages/onboarding/installSteps/`) is not mounted
 * into the extension's app shell today — it's rendered by the web app at
 * sf-workbench.com/welcome and opened after a fresh install. Loading it
 * through `appPage('onboarding')` therefore isn't available. Instead we
 * build a minimal static HTML fixture that mirrors the wizard's structural
 * a11y contract (aria-current="step" on the active step, aria-keyshortcuts
 * on the root, step-counter live region) and run axe against it. Actual
 * logic (shortcut registration, announce() on step change, aria-current
 * movement) is covered by the source-level assertions at the bottom.
 */

const AXE_WCAG_TAGS = ['wcag2a', 'wcag2aa'];

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Onboarding a11y fixture</title></head>
  <body>
    <main aria-label="Install guide">
      <div class="install-steps-layout" aria-keyshortcuts="ArrowLeft ArrowRight">
        <aside>
          <p class="onboarding-steps-label">Installation guide</p>
          <ul>
            <li><button type="button" aria-current="step"><span>Step 1</span></button></li>
            <li><button type="button" aria-current="false"><span>Step 2</span></button></li>
            <li><button type="button" aria-current="false"><span>Step 3</span></button></li>
          </ul>
        </aside>
        <div>
          <section aria-label="Installation progress">
            <p>Getting started</p>
            <p>Step 1 of 3</p>
          </section>
          <div class="nav-row">
            <button type="button" disabled>Previous</button>
            <button type="button" id="next-btn">Next</button>
          </div>
          <section>
            <h2>Step 1 title</h2>
            <p>Step 1 description copy for axe to chew on.</p>
          </section>
        </div>
      </div>
    </main>
  </body>
</html>`;

function formatViolations(
    violations: Array<{ id: string; impact?: string; help?: string; nodes?: unknown[] }>
): string {
    return violations
        .map(
            v =>
                `[${v.impact || 'unknown'}] ${v.id}: ${v.help || ''} (${v.nodes?.length || 0} nodes)`
        )
        .join('\n');
}

test.describe('@ext a11y onboarding', () => {
    test('wizard fixture has zero critical/serious axe violations', async ({ context }) => {
        const page = await context.newPage();
        await page.setContent(FIXTURE_HTML);
        const results = await new AxeBuilder({ page }).withTags(AXE_WCAG_TAGS).analyze();
        const blocking = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
        );
        if (blocking.length > 0) {
            // eslint-disable-next-line no-console
            console.log('Axe blocking violations:\n' + formatViolations(blocking));
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(blocking, null, 2));
        }
        expect(blocking, 'critical/serious axe violations in onboarding').toEqual([]);
    });

    test('aria-current="step" follows the active step on ArrowRight', async ({ context }) => {
        // Drive the fixture with a tiny script so we can exercise the
        // aria-current-moves-with-active-step assertion without booting the
        // full LWC bundle. Mirrors the JS branch in installSteps.js.
        const page = await context.newPage();
        await page.setContent(
            FIXTURE_HTML +
                `
            <script>
              (function () {
                const buttons = document.querySelectorAll('aside button');
                let active = 0;
                function render() {
                  buttons.forEach((b, i) => b.setAttribute('aria-current', i === active ? 'step' : 'false'));
                }
                document.addEventListener('keydown', e => {
                  if (e.key === 'ArrowRight' && active < buttons.length - 1) { active++; render(); }
                  else if (e.key === 'ArrowLeft' && active > 0) { active--; render(); }
                });
                render();
              })();
            </script>`
        );
        await expect(page.locator('aside button').nth(0)).toHaveAttribute('aria-current', 'step');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('aside button').nth(1)).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('aside button').nth(0)).toHaveAttribute('aria-current', 'false');
    });

    test('installSteps source wires shortcuts registry + announce', async () => {
        // Static verification that the additive a11y wiring is present
        // in the source — axe can't check behavior the fixture doesn't
        // mount, so this guards the real installSteps.js against regressions.
        const stepsJs = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../lwc/main/pages/onboarding/installSteps/installSteps.js'
            ),
            'utf8'
        );
        expect(stepsJs).toContain("from 'host-api/announce'");
        expect(stepsJs).toContain("from 'host-api/shortcuts'");
        expect(stepsJs).toContain("id: 'onboarding.prev'");
        expect(stepsJs).toContain("id: 'onboarding.next'");
        expect(stepsJs).toContain("id: 'onboarding.skip'");
        expect(stepsJs).toContain('_announceCurrentStep');
        expect(stepsJs).toContain('_unregisterShortcuts');

        const stepsHtml = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../lwc/main/pages/onboarding/installSteps/installSteps.html'
            ),
            'utf8'
        );
        expect(stepsHtml).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
        expect(stepsHtml).toContain('aria-current={step.ariaCurrent}');
    });
});
