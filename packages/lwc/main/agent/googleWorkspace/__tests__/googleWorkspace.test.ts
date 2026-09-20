import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGoogleRequest, googleRequest } from '../googleWorkspace';
import { getToolPolicy } from '../../tools/modules/toolPolicy';
import { createGoogleWorkspaceTools } from '../tools';
import { filterToolsByModel } from '../../tools/modules/modelToolSupport';

test('Google function tools survive model filtering with open Slides request schemas', () => {
    const tools = createGoogleWorkspaceTools();
    assert.equal(filterToolsByModel(tools, 'gpt-4o').length, 6);
    assert.equal(filterToolsByModel(tools, 'gemini-2.5-pro').length, 6);
    assert.equal(tools.find(tool => tool.name === 'google_slides_update')?.strict, false);
});

test('Drive queries escape names and support pagination without accepting arbitrary endpoints', () => {
    const request = buildGoogleRequest('drive.listFiles', {
        query: "Board's deck",
        pageToken: 'next',
    });
    const url = new URL(request.url);
    assert.equal(url.searchParams.get('q'), "trashed = false and name contains 'Board\\'s deck'");
    assert.equal(url.searchParams.get('pageToken'), 'next');
    assert.throws(() => buildGoogleRequest('drive.getFile', { fileId: '../../secret' }), /Invalid/);
    assert.throws(() => buildGoogleRequest('drive.deleteFile', {}), /Unsupported/);
});
test('template copy, slide revisions, and previews map to documented requests', () => {
    assert.deepEqual(
        buildGoogleRequest('drive.copyFile', { fileId: 'template', name: 'QBR' }).body,
        { name: 'QBR' }
    );
    const request = buildGoogleRequest('slides.batchUpdate', {
        presentationId: 'deck',
        requiredRevisionId: 'r1',
        requests: [{ replaceAllText: {} }],
    });
    assert.deepEqual(request.body, {
        requests: [{ replaceAllText: {} }],
        writeControl: { requiredRevisionId: 'r1' },
    });
    assert.match(
        buildGoogleRequest('slides.getThumbnail', { presentationId: 'deck', pageId: 'page' }).url,
        /pages\/page\/thumbnail/
    );
    assert.throws(
        () => buildGoogleRequest('slides.batchUpdate', { presentationId: 'deck', requests: [] }),
        /between 1 and 100/
    );
});
test('Google reads bypass approvals, edits retain the existing approval policy', () => {
    assert.equal(getToolPolicy('google_slides_get').requiresApproval, false);
    assert.equal(getToolPolicy('google_slides_preview').requiresApproval, false);
    assert.equal(getToolPolicy('google_slides_update').requiresApproval, true);
    assert.equal(getToolPolicy('google_drive_copy').requiresApproval, true);
});
test('authenticated fetch keeps tokens out of outputs and handles revocation and cancellation', async () => {
    const request = buildGoogleRequest('slides.getPresentation', { presentationId: 'deck' });
    const deps = {
        getToken: async () => 'private-token',
        fetch: async (_url, init) => {
            assert.equal(init.headers.Authorization, 'Bearer private-token');
            return new Response(JSON.stringify({ presentationId: 'deck' }));
        },
    };
    assert.deepEqual(await googleRequest(request, undefined, deps), { presentationId: 'deck' });
    await assert.rejects(
        googleRequest(request, undefined, {
            ...deps,
            fetch: async () => new Response('private-token', { status: 401 }),
        }),
        /access expired/
    );
    await assert.rejects(googleRequest(request, AbortSignal.abort(), deps), /abort/i);
    await assert.rejects(
        googleRequest({ method: 'GET', url: 'https://evil.example' }, undefined, deps),
        /Unsupported/
    );
});
test('text imports are bounded and fail explicitly instead of storing partial documents', async () => {
    const request = buildGoogleRequest('drive.exportText', { fileId: 'doc' });
    const deps = {
        getToken: async () => 'token',
        fetch: async () => new Response('selected document'),
    };
    assert.equal(await googleRequest(request, undefined, deps), 'selected document');
    await assert.rejects(
        googleRequest(request, undefined, {
            ...deps,
            fetch: async () => new Response('x'.repeat(1000001)),
        }),
        /smaller than 1 MB/
    );
});
