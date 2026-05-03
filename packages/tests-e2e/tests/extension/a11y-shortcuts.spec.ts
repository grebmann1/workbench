/**
 * Keyboard-shortcut regression gate.
 *
 * The a11y sweep added aria-keyshortcuts attributes and a shortcut
 * registry. It also removed the skillsPanel textarea's Tab interception
 * (Tab used to insert 2 spaces; now it does native focus nav and an
 * explicit "Insert indent" button takes the indent affordance). Every
 * other custom keyboard handler in the app was preserved.
 *
 * This spec locks that contract in — so a future change that accidentally
 * removes or rebinds a shortcut will fail this test before it ships.
 *
 * Approach: read the shortcut registry directly from the built extension
 * (source-level — same pattern as T1-B's source-assert tests), since the
 * registry is populated at component connectedCallback time and the exact
 * timing/routing of those callbacks in the extension context varies.
 */
import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from './fixtures';

// Playwright transpiles specs to CJS where __dirname is defined. Repo root
// is 4 levels up from packages/tests-e2e/tests/extension/.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readSource(relative: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

test.describe('@ext a11y — keyboard shortcuts regression', () => {
    // ------------------------------------------------------------------
    // Existing custom keyboard handlers (source-level guards) — any
    // refactor that removes/rebinds one of these should also update this
    // spec. The point is NOT to assert UX behavior end-to-end (which the
    // per-surface specs cover); it's to hard-pin the registrations.
    // ------------------------------------------------------------------

    test('inputQuickPick: Cmd/Ctrl+ArrowUp/ArrowDown listener is still registered', () => {
        const src = readSource('packages/lwc/extension/feature/inputQuickPick/inputQuickPick.ts');
        expect(src).toMatch(/addEventListener\(['"]keydown['"]/);
        // Must still gate on ArrowUp / ArrowDown.
        expect(src).toMatch(/ArrowUp|ArrowDown/);
        // Must still check for modifier key (Meta or Control).
        expect(src).toMatch(/metaKey|ctrlKey/);
    });

    test('skillsPanel: Escape listener is still registered + registered with shortcut registry', () => {
        const src = readSource('packages/lwc/main/agent/skillsPanel/skillsPanel.ts');
        // Escape listener still there.
        expect(src).toMatch(/addEventListener\(['"]keydown['"]/);
        expect(src).toMatch(/Escape/);
        // Shortcut registry entry added by T1-B.
        expect(src).toMatch(/skills\.close/);
        expect(src).toMatch(/registerShortcut/);
    });

    test('skillsPanel: Tab-trap in editor body is REMOVED (a11y fix)', () => {
        const src = readSource('packages/lwc/main/agent/skillsPanel/skillsPanel.ts');
        // The handleContentKeydown method that inserted 2 spaces on Tab
        // must be gone. Its replacement is handleInsertIndent.
        expect(src).not.toMatch(/handleContentKeydown/);
        expect(src).toMatch(/handleInsertIndent/);
        const html = readSource('packages/lwc/main/agent/skillsPanel/skillsPanel.html');
        // The textarea must no longer wire onkeydown={handleContentKeydown}.
        expect(html).not.toMatch(/onkeydown=\{handleContentKeydown\}/);
        // The new toolbar button must exist.
        expect(html).toMatch(/Insert indent/i);
    });

    test('onboarding installSteps: ArrowLeft/ArrowRight + Escape handlers still present', () => {
        const src = readSource('packages/lwc/main/pages/onboarding/installSteps/installSteps.js');
        expect(src).toMatch(/addEventListener\(['"]keydown['"]/);
        expect(src).toMatch(/ArrowLeft|ArrowRight/);
        expect(src).toMatch(/Escape/);
        // Shortcut registry entries added by T1-A.
        expect(src).toMatch(/registerShortcut/);
        expect(src).toMatch(/onboarding\.(prev|next|skip)/);
    });

    test('soql cellEditor: Enter/Escape commit-cancel handlers still present', () => {
        const src = readSource('packages/lwc/applications/soql/cellEditor/cellEditor.ts');
        expect(src).toMatch(/Enter/);
        expect(src).toMatch(/Escape/);
        // T1-C announce() calls.
        expect(src).toMatch(/announce\(/);
    });

    // ------------------------------------------------------------------
    // Shared infrastructure guards (Phase 1)
    // ------------------------------------------------------------------

    test('host-api/announce: announce + subscribeAnnouncements are exported', () => {
        const src = readSource('packages/lwc/main/host-api/announce/announce.ts');
        expect(src).toMatch(/export function announce/);
        expect(src).toMatch(/export function subscribeAnnouncements/);
    });

    test('host-api/shortcuts: registry API is exported', () => {
        const src = readSource('packages/lwc/main/host-api/shortcuts/shortcuts.ts');
        expect(src).toMatch(/export function registerShortcut/);
        expect(src).toMatch(/export function listShortcuts/);
        expect(src).toMatch(/export function subscribeShortcuts/);
    });

    test('slds/focusTrap: createFocusTrap is exported', () => {
        const src = readSource('packages/lwc/main/component/slds/focusTrap/focusTrap.ts');
        expect(src).toMatch(/export function createFocusTrap/);
    });

    // ------------------------------------------------------------------
    // Build + resolver guards (must not regress)
    // ------------------------------------------------------------------

    test('rollup: host-api/announce + host-api/shortcuts are registered modules', () => {
        const src = readSource('tools/build/rollup.extension.mjs');
        expect(src).toMatch(/host-api\/announce/);
        expect(src).toMatch(/host-api\/shortcuts/);
    });

    test('tsconfig: host-api/announce, host-api/shortcuts, slds/focusTrap path mappings exist', () => {
        const src = readSource('packages/lwc/main/tsconfig.json');
        expect(src).toMatch(/"host-api\/announce"/);
        expect(src).toMatch(/"host-api\/shortcuts"/);
        expect(src).toMatch(/"slds\/focusTrap"/);
    });
});
