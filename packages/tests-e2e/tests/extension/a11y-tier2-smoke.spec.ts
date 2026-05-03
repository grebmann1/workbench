import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';

/**
 * Tier-2 axe smoke: critical-only gate across every routable Tier-2
 * application. Serious/Moderate/Minor issues are logged into
 * `docs/a11y-follow-ups.md` (T2 backlog) and are intentionally NOT
 * asserted here — Tier-2 apps only fail this spec on axe impact=critical.
 *
 * Rule suppressions: the same pre-existing lightning-base-components
 * shadow-DOM rules documented in docs/a11y-follow-ups.md are disabled
 * here — they fire on every LWC surface because the inner shadow root
 * (where role=list / role=listitem / the inner <button> lives) is not
 * traversed by axe's structural rules.
 *
 * GraphQL Explorer is in the Tier-2 scope doc but has no source folder
 * (`packages/lwc/applications/graphql/`) in this worktree, so it is
 * skipped from this spec.
 */

const T2_APPS: Array<{ name: string; applicationName: string }> = [
    { name: 'Access Analyzer', applicationName: 'access' },
    { name: 'Anonymous Apex', applicationName: 'anonymousapex' },
    { name: 'API Explorer', applicationName: 'api' },
    { name: 'Data Import', applicationName: 'dataimport' },
    { name: 'Files', applicationName: 'files' },
    { name: 'Deploy/Retrieve', applicationName: 'package' },
    { name: 'Event Explorer', applicationName: 'platformevent' },
    { name: 'Record Viewer', applicationName: 'recordviewer' },
    { name: 'Smart Input', applicationName: 'smartinput' },
    { name: 'Text Compare', applicationName: 'textcompare' },
    { name: 'URL Encoder', applicationName: 'urlencoder' },
    { name: 'Org Overview', applicationName: 'org' },
    { name: 'SObject Explorer', applicationName: 'sobject' },
];

const SUPPRESSED_RULES = ['aria-required-children', 'aria-required-parent', 'button-name'];

test.describe('@ext a11y tier 2 — critical-only smoke', () => {
    for (const app of T2_APPS) {
        test(`${app.name} has no critical axe violations`, async ({ appPage }) => {
            const page = await appPage(app.applicationName);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa'])
                .disableRules(SUPPRESSED_RULES)
                .analyze();
            const critical = results.violations.filter(v => v.impact === 'critical');
            if (critical.length > 0) {
                // Surface what axe saw so CI failures are diagnosable
                // without a local re-run.
                // eslint-disable-next-line no-console
                console.log(
                    `Axe critical violations in ${app.name} (${app.applicationName}):\n` +
                        JSON.stringify(critical, null, 2)
                );
            }
            expect(critical, `critical axe violations in ${app.name}`).toHaveLength(0);
        });
    }
});
