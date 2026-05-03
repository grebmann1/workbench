/**
 * Tier-1 Accessibility sweep for the Agent UI surfaces.
 *
 * Covers: agent publisher (+ slash picker), message list (+ message,
 * reasoningBlock, toolMessage), and the skills panel.
 *
 * The agent chat is not mounted on a dedicated applicationName route and
 * the publisher itself is gated behind `isAiProviderConfigured` — without
 * a live provider config, a full-shell run does not render the surfaces
 * we need to scan. We therefore follow the same pattern as
 * `a11y-onboarding.spec.ts`: run axe against a minimal static fixture
 * mirroring the a11y contract of each surface, plus source-level
 * assertions that guard the additive wiring against regression.
 */
import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';

const AXE_WCAG_TAGS = ['wcag2a', 'wcag2aa'];

const MAIN_DIR = path.resolve(__dirname, '../../../lwc/main');
const readMain = (rel: string) => fs.readFileSync(path.resolve(MAIN_DIR, rel), 'utf8');

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

// A static HTML fixture that mirrors the exact a11y contract we added to
// the agent LWCs. Keep this small — axe only needs enough DOM to
// exercise the roles, labels, and attribute relationships.
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Agent a11y fixture</title></head>
  <body>
    <!-- Conversation history -->
    <div role="log" aria-live="polite" aria-label="Conversation history" class="message-list-container">
      <ul>
        <li>
          <!-- reasoningBlock (collapsed) -->
          <button type="button" aria-expanded="false" aria-controls="reasoning-panel-1" aria-label="Thought briefly">Reasoning</button>
          <!-- toolMessage -->
          <div role="group" aria-label="Tool result: bash">
            <button type="button" aria-expanded="false" aria-label="Expand tool details">Bash</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- Publisher + slash picker (listbox pattern) -->
    <label for="p-textarea" class="visually-hidden" style="position:absolute;left:-9999px">Prompt input</label>
    <div id="slash-picker-listbox" role="listbox" aria-label="Slash commands">
      <button type="button" id="slash-opt-0" role="option" aria-selected="true">/skill</button>
      <button type="button" id="slash-opt-1" role="option" aria-selected="false">/clear</button>
    </div>
    <textarea id="p-textarea" aria-label="Prompt input" role="combobox" aria-expanded="true"
              aria-controls="slash-picker-listbox" aria-autocomplete="list"
              aria-activedescendant="slash-opt-0"></textarea>

    <!-- Skills panel (listbox + editor toolbar) -->
    <div class="skills-panel" role="region" aria-label="Skills panel" aria-keyshortcuts="Escape">
      <label for="skills-search" style="position:absolute;left:-9999px">Search skills</label>
      <input id="skills-search" type="search" aria-label="Search skills" />
      <ul role="listbox" aria-label="Skills">
        <li role="option" aria-selected="false">bash</li>
      </ul>
      <div role="toolbar" aria-label="Editor actions">
        <button type="button" aria-label="Insert indent (two spaces)">Insert indent</button>
      </div>
      <label for="skill-body" style="position:absolute;left:-9999px">Body</label>
      <textarea id="skill-body"></textarea>
    </div>
  </body>
</html>`;

test.describe('@extension a11y agent', () => {
    test('agent fixture has zero critical/serious axe violations', async ({ context }) => {
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
        expect(blocking, 'critical/serious axe violations in agent surfaces').toEqual([]);
    });

    test('slash picker listbox: ArrowDown updates aria-activedescendant; Escape closes', async ({
        context,
    }) => {
        const page = await context.newPage();
        // Minimal interactive fixture that drives the exact attribute
        // changes the publisher emits (combobox open/close + active index).
        await page.setContent(`
          <div id="slash-picker-listbox" role="listbox" aria-label="Slash commands">
            <button id="slash-opt-0" role="option" aria-selected="true">/skill</button>
            <button id="slash-opt-1" role="option" aria-selected="false">/clear</button>
          </div>
          <textarea id="p" aria-label="Prompt input" role="combobox"
                    aria-expanded="false" aria-controls="slash-picker-listbox"
                    aria-autocomplete="list"></textarea>
          <script>
            const input = document.getElementById('p');
            const opts = [...document.querySelectorAll('[role="option"]')];
            let active = 0;
            function open() { input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-activedescendant', 'slash-opt-' + active); }
            function close() { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
            input.addEventListener('input', e => {
              if (input.value.startsWith('/')) open(); else close();
            });
            input.addEventListener('keydown', e => {
              if (input.getAttribute('aria-expanded') !== 'true') return;
              if (e.key === 'ArrowDown') { active = (active + 1) % opts.length; open(); e.preventDefault(); }
              else if (e.key === 'ArrowUp') { active = (active - 1 + opts.length) % opts.length; open(); e.preventDefault(); }
              else if (e.key === 'Escape') { close(); e.preventDefault(); }
            });
          </script>
        `);

        const input = page.locator('#p');
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await input.focus();
        await input.type('/');
        await expect(input).toHaveAttribute('aria-expanded', 'true');
        await expect(input).toHaveAttribute('aria-activedescendant', 'slash-opt-0');
        await input.press('ArrowDown');
        await expect(input).toHaveAttribute('aria-activedescendant', 'slash-opt-1');
        await input.press('Escape');
        await expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    test('streaming message aria-busy flips from true to false on finish', async ({ context }) => {
        // Mirrors the flip wired into messageList.ts via the
        // `streamingAriaBusy` getter — when a streamingMessage is set the
        // container exposes true, and once cleared it reads false.
        const page = await context.newPage();
        await page.setContent(`
          <div role="log" aria-live="polite" aria-label="Conversation history">
            <article id="msg" aria-busy="true">streaming…</article>
          </div>
          <button id="finish">finish</button>
          <script>
            document.getElementById('finish').addEventListener('click', () => {
              document.getElementById('msg').setAttribute('aria-busy', 'false');
            });
          </script>
        `);
        await expect(page.locator('#msg')).toHaveAttribute('aria-busy', 'true');
        await page.locator('#finish').click();
        await expect(page.locator('#msg')).toHaveAttribute('aria-busy', 'false');
    });

    test('publisher source wires combobox/listbox + announce', () => {
        const html = readMain('agent/publisher/publisher.html');
        expect(html).toContain('role="combobox"');
        expect(html).toContain('aria-expanded={slashExpanded}');
        expect(html).toContain('aria-controls="slash-picker-listbox"');
        expect(html).toContain('aria-autocomplete="list"');
        expect(html).toContain('aria-activedescendant={slashActiveDescendantId}');
        expect(html).toContain('id="slash-picker-listbox"');
        expect(html).toContain('role="listbox"');
        expect(html).toContain('role="option"');
        expect(html).toContain('id={suggestion.optionId}');

        const ts = readMain('agent/publisher/publisher.ts');
        expect(ts).toContain("from 'host-api/announce'");
        expect(ts).toContain('announce(`${count} command');
        expect(ts).toContain("announce('Commands menu closed')");
        expect(ts).toContain('get slashExpanded()');
        expect(ts).toContain('get slashActiveDescendantId()');
    });

    test('messageList source wires role=log + streaming aria-busy', () => {
        const html = readMain('agent/messageList/messageList.html');
        expect(html).toContain('role="log"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('aria-label="Conversation history"');
        expect(html).toContain('aria-busy={streamingAriaBusy}');

        const ts = readMain('agent/messageList/messageList.ts');
        expect(ts).toContain('get streamingAriaBusy()');
    });

    test('reasoningBlock source wires aria-expanded/aria-controls + announce', () => {
        const html = readMain('agent/reasoningBlock/reasoningBlock.html');
        expect(html).toContain('aria-expanded={expanded}');
        expect(html).toContain('aria-controls={panelId}');
        expect(html).toContain('id={panelId}');

        const ts = readMain('agent/reasoningBlock/reasoningBlock.ts');
        expect(ts).toContain("from 'host-api/announce'");
        expect(ts).toContain(
            "announce(this.expanded ? 'Reasoning expanded' : 'Reasoning collapsed')"
        );
        expect(ts).toContain('get panelId()');
    });

    test('toolMessage source exposes role=group + aria-label=Tool result', () => {
        const html = readMain('agent/toolMessage/toolMessage.html');
        expect(html).toContain('role="group"');
        expect(html).toContain('aria-label={toolContainerAriaLabel}');

        const ts = readMain('agent/toolMessage/toolMessage.ts');
        expect(ts).toContain('get toolContainerAriaLabel()');
        expect(ts).toContain('Tool result:');
    });

    test('message source announces clipboard toast into the live region', () => {
        const ts = readMain('agent/message/message.ts');
        expect(ts).toContain("from 'host-api/announce'");
        expect(ts).toContain('announce(confirmation)');
    });

    test('skillsPanel source removes Tab-trap, wires focus trap + shortcuts + toolbar', () => {
        const ts = readMain('agent/skillsPanel/skillsPanel.ts');
        // Legacy Tab-inserts-spaces handler has been removed.
        expect(ts).not.toContain('handleContentKeydown');
        // Replacement: explicit "Insert indent" action.
        expect(ts).toContain('handleInsertIndent');
        // Focus trap + host-api wiring.
        // Accept either the long `component/slds/...` path or the
        // shorter `slds/focusTrap` alias that the formatter may rewrite to.
        expect(ts).toMatch(/from '(component\/slds\/focusTrap\/focusTrap|slds\/focusTrap)'/);
        expect(ts).toContain("from 'host-api/announce'");
        expect(ts).toContain("from 'host-api/shortcuts'");
        expect(ts).toContain("id: 'skills.close'");
        expect(ts).toContain("id: 'skills.indent'");
        expect(ts).toContain('createFocusTrap(this.template)');
        // Announce open/close for screen readers.
        expect(ts).toContain("announce('Skills panel opened')");
        expect(ts).toContain("announce('Skills panel closed')");

        const html = readMain('agent/skillsPanel/skillsPanel.html');
        // Panel root documents its keyboard close shortcut.
        expect(html).toContain('aria-keyshortcuts="Escape"');
        expect(html).toContain('aria-label="Search skills"');
        // List semantics for the results.
        expect(html).toContain('role="listbox"');
        expect(html).toContain('aria-label="Skills"');
        // The old onkeydown hijack on the textarea is gone.
        expect(html).not.toContain('onkeydown={handleContentKeydown}');
        // New explicit toolbar button replaces Tab.
        expect(html).toContain('role="toolbar"');
        expect(html).toContain('aria-label="Insert indent (two spaces)"');
        expect(html).toContain('onclick={handleInsertIndent}');
    });
});
