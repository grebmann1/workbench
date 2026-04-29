import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifySkillPath, formatSkillsForPrompt, type DiscoveredSkill } from '../skills.ts';
import { SKILLS_INSTRUCTIONS } from '../constants.ts';

function mkSkill(partial: Partial<DiscoveredSkill>): DiscoveredSkill {
    return {
        name: 'sample',
        description: 'Describes a sample skill',
        skillMdPath: '/workspace/skills/sample/SKILL.md',
        rootDir: '/workspace/skills/sample',
        scope: 'project',
        source: 'bundled',
        ...partial,
    };
}

test('formatSkillsForPrompt: returns null for empty list', () => {
    assert.equal(formatSkillsForPrompt([]), null);
});

test('formatSkillsForPrompt: prepends SKILLS_INSTRUCTIONS and wraps in <available_skills>', () => {
    const out = formatSkillsForPrompt([mkSkill({})]);
    assert.ok(out);
    assert.ok(out!.startsWith(SKILLS_INSTRUCTIONS));
    assert.ok(out!.includes('<available_skills>'));
    assert.ok(out!.includes('</available_skills>'));
});

test('formatSkillsForPrompt: emits <skill> with name/description/location', () => {
    const out = formatSkillsForPrompt([
        mkSkill({
            name: 'soql-expert',
            description: 'Writes SOQL queries',
            skillMdPath: '/workspace/skills/soql-expert/SKILL.md',
        }),
    ])!;
    assert.ok(out.includes('<name>soql-expert</name>'));
    assert.ok(out.includes('<description>Writes SOQL queries</description>'));
    assert.ok(out.includes('<location>/workspace/skills/soql-expert/SKILL.md</location>'));
});

test('formatSkillsForPrompt: escapes XML-sensitive characters', () => {
    const out = formatSkillsForPrompt([
        mkSkill({
            name: 'tricky & <name>',
            description: 'Uses "quotes" & <tags>',
            skillMdPath: '/path/with & <weird>.md',
        }),
    ])!;
    assert.ok(out.includes('tricky &amp; &lt;name&gt;'));
    assert.ok(out.includes('&quot;quotes&quot;'));
    assert.ok(out.includes('&lt;tags&gt;'));
    assert.ok(out.includes('/path/with &amp; &lt;weird&gt;.md'));
    // Raw unescaped markers must not leak through
    assert.equal(out.includes('<name>tricky & <name></name>'), false);
});

test('classifySkillPath: bundled path defaults to project/bundled', () => {
    const out = classifySkillPath('/workspace/skills/salesforce/soql/SKILL.md');
    assert.equal(out.source, 'bundled');
    assert.equal(out.scope, 'project');
});

test('classifySkillPath: custom-skills path is project/custom', () => {
    const out = classifySkillPath('/workspace/skills/custom-skills/alpha/SKILL.md');
    assert.equal(out.source, 'custom');
    assert.equal(out.scope, 'project');
});

test('classifySkillPath: .cursor/skills path is user/custom', () => {
    const out = classifySkillPath('/workspace/.cursor/skills/beta/SKILL.md');
    assert.equal(out.source, 'custom');
    assert.equal(out.scope, 'user');
});

test('formatSkillsForPrompt: joins multiple skills with newlines', () => {
    const out = formatSkillsForPrompt([
        mkSkill({ name: 'alpha', skillMdPath: '/workspace/skills/alpha/SKILL.md' }),
        mkSkill({ name: 'beta', skillMdPath: '/workspace/skills/beta/SKILL.md' }),
    ])!;
    const alphaIdx = out.indexOf('<name>alpha</name>');
    const betaIdx = out.indexOf('<name>beta</name>');
    assert.ok(alphaIdx > 0 && betaIdx > alphaIdx);
    // Both skill blocks should appear between the wrapper tags
    const body = out.slice(out.indexOf('<available_skills>'), out.indexOf('</available_skills>'));
    assert.ok(body.includes('<name>alpha</name>'));
    assert.ok(body.includes('<name>beta</name>'));
});
