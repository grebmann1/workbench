import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath) {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function getLatestReleaseLabel(text, fileLabel) {
    const match = text.match(/Latest release:\s*\*\*(v[\d.]+)\*\*/);
    assert.ok(match, `${fileLabel} must contain a "Latest release: **vX.Y.Z**" line`);
    return match[1];
}

test('docs/release: README, docs, and release metadata stay version-synced', () => {
    const packageJson = JSON.parse(readRepoFile('package.json'));
    const expectedVersion = String(packageJson.version);
    const expectedLabel = `v${expectedVersion}`;
    const expectedVersionPattern = new RegExp(`\\bv?${expectedVersion.replace(/\./g, '\\.')}\\b`);

    const readme = readRepoFile('readme.md');
    assert.equal(
        getLatestReleaseLabel(readme, 'readme.md'),
        expectedLabel,
        'README latest release must match package.json version'
    );

    const docsIntro = readRepoFile('apps/docs/docs/intro.mdx');
    assert.equal(
        getLatestReleaseLabel(docsIntro, 'apps/docs/docs/intro.mdx'),
        expectedLabel,
        'Docs intro latest release must match package.json version'
    );

    const releaseNotes = JSON.parse(readRepoFile('assets/extension/releaseNotes.json'));
    assert.ok(Array.isArray(releaseNotes) && releaseNotes.length > 0, 'releaseNotes.json must be non-empty');
    assert.equal(
        String(releaseNotes[0]?.version),
        expectedVersion,
        'Top releaseNotes.json entry must match package.json version'
    );

    const announcement = JSON.parse(readRepoFile('assets/server/data/announcements.json'))?.announcement;
    assert.ok(announcement, 'announcements.json must contain an announcement payload');
    assert.match(
        String(announcement.title || ''),
        expectedVersionPattern,
        'Announcement title should reference current package version'
    );
    assert.match(
        String(announcement.message || ''),
        expectedVersionPattern,
        'Announcement message should reference current package version'
    );
});
