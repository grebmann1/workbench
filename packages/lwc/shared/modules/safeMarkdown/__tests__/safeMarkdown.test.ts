import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSafeMarkdownImage, isSafeMarkdownLink } from '../safeMarkdown.ts';

test('links only accept deliberate web, record, object and workspace destinations', () => {
    for (const href of [
        'https://example.test/docs',
        'sftoolkit:/workspace/report.md',
        'sfrecord:/001000000000000',
        'sfobject:/Account',
        '#section',
    ]) {
        assert.equal(isSafeMarkdownLink(href), true, href);
    }
    for (const href of [
        'javascript:alert(1)',
        'data:text/html,hello',
        'java\nscript:alert(1)',
        '//tracker.test',
        '/\\tracker.test',
        'https://user:secret@example.test',
    ]) {
        assert.equal(isSafeMarkdownLink(href), false, href);
    }
});

test('chat images cannot load remote or same-origin URLs; raster attachments are allowed', () => {
    for (const src of [
        'https://tracker.test/pixel',
        '//tracker.test/pixel',
        '/logout',
        'data:image/svg+xml;base64,AAAA',
    ]) {
        assert.equal(isSafeMarkdownImage(src, false), false, src);
    }
    assert.equal(isSafeMarkdownImage('data:image/png;base64,AAAA', false), true);
    assert.equal(isSafeMarkdownImage('https://example.test/image.png', true), true);
});
