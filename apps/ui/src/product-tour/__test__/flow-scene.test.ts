import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ASSISTANT_REPLY,
    CHAR_MS,
    FORM_EMAIL,
    FORM_MESSAGE,
    FORM_NAME,
    FORM_ORDER,
    LWC_HTML,
    PALETTE_QUERY,
    SEARCH_QUERY,
    SOQL_QUERY,
    FLOW_LOOP_MS,
    T,
    T_ACTION,
    T_BUNDLE,
    T_EDITOR,
    T_FORM_NAME,
    T_HTML_DONE,
    T_LOADING_EDITOR,
    T_LOADING_SOQL,
    T_PALETTE,
    T_RESULTS,
    T_SIDEPANEL,
    T_SOQL,
    T_STREAM,
    T_TYPE_HTML,
    T_TYPE_PALETTE,
    T_VSCODE_PULSE,
    completedScene,
    headingForView,
    sceneForElapsed,
} from '../flow-scene.ts';
import { MAX_FIXTURE_SCALE, spatialFixtureScale } from '../slides.ts';
import { completedSlidePlay, slidePlayForElapsed } from '../slide-scene.ts';

test('spatialFixtureScale: scales together and caps at the legibility ceiling', () => {
    assert.equal(spatialFixtureScale(360, 720), 0.5);
    assert.equal(spatialFixtureScale(720, 720), 1);
    assert.equal(spatialFixtureScale(1280, 720), MAX_FIXTURE_SCALE);
    assert.equal(spatialFixtureScale(1280, 720, 700, 700), 1);
    assert.equal(spatialFixtureScale(1280, 720, 350, 700), 0.5);
});

test('sceneForElapsed: starts on a Salesforce page with the overlay closed', () => {
    const scene = sceneForElapsed(0);
    assert.equal(scene.view, 'salesforce');
    assert.equal(scene.overlayOpen, false);
    assert.equal(scene.loading, false);
    assert.equal(scene.captionKey, 'edge');
    assert.equal(headingForView(scene.view), 'overlay');
});

test('sceneForElapsed: opens the overlay then types Account', () => {
    const opened = sceneForElapsed(T.overlayOpen + 10);
    assert.equal(opened.overlayOpen, true);
    assert.equal(opened.captionKey, 'overlay');
    const typing = sceneForElapsed(T.typeSearch + SEARCH_QUERY.length * CHAR_MS);
    assert.equal(typing.overlaySearch, SEARCH_QUERY);
    assert.equal(typing.captionKey, 'search');
});

test('sceneForElapsed: pulses VS Code then opens the editor', () => {
    const pulse = sceneForElapsed(T_VSCODE_PULSE + 10);
    assert.equal(pulse.vscodeHot, true);
    assert.equal(pulse.view, 'salesforce');
    const loading = sceneForElapsed(T_LOADING_EDITOR + 50);
    assert.equal(loading.loading, true);
    assert.equal(loading.loadingTarget, 'editor');
    assert.equal(loading.captionKey, 'loadingEditor');
    const editor = sceneForElapsed(T_EDITOR + 10);
    assert.equal(editor.view, 'editor');
    assert.equal(editor.loading, false);
    assert.equal(headingForView(editor.view), 'editor');
});

test('sceneForElapsed: opens the palette then types an LWC template', () => {
    const palette = sceneForElapsed(T_PALETTE + 10);
    assert.equal(palette.view, 'editor');
    assert.equal(palette.paletteOpen, true);
    assert.equal(palette.palettePhase, 'command');
    const typingCmd = sceneForElapsed(T_TYPE_PALETTE + PALETTE_QUERY.length * CHAR_MS);
    assert.equal(typingCmd.paletteQuery, PALETTE_QUERY);
    const bundled = sceneForElapsed(T_BUNDLE + 10);
    assert.equal(bundled.bundleReady, true);
    assert.equal(bundled.paletteOpen, false);
    const typing = sceneForElapsed(T_TYPE_HTML + 10);
    assert.equal(typing.caret, 'editor');
    assert.equal(typing.editorDirty, true);
    const done = sceneForElapsed(T_HTML_DONE + 10);
    assert.equal(done.editorTyped, LWC_HTML);
    assert.match(done.editorTyped, /<lightning-card title=\{name\}>/);
    assert.equal(done.captionKey, 'editorReady');
});

test('sceneForElapsed: lands in SOQL Explorer with a typed query and results', () => {
    const loading = sceneForElapsed(T_LOADING_SOQL + 20);
    assert.equal(loading.loadingTarget, 'soql');
    const soql = sceneForElapsed(T_SOQL + 10);
    assert.equal(soql.view, 'soql');
    assert.equal(soql.loading, false);
    assert.equal(headingForView(soql.view), 'soql');
    const withQuery = sceneForElapsed(T_RESULTS + 10);
    assert.equal(withQuery.soqlDraft, SOQL_QUERY);
    assert.equal(withQuery.resultsVisible, true);
    assert.equal(withQuery.captionKey, 'results');
});

test('sceneForElapsed: opens a side panel and fills the Acme support form', () => {
    const panel = sceneForElapsed(T_SIDEPANEL + 10);
    assert.equal(panel.view, 'sidepanel');
    assert.equal(headingForView(panel.view), 'agent');
    assert.equal(panel.captionKey, 'ask');
    const streaming = sceneForElapsed(T_STREAM + 50);
    assert.ok(streaming.assistant.length > 0);
    const filling = sceneForElapsed(T_FORM_NAME + 10);
    assert.equal(filling.formFocus, 'name');
    assert.equal(filling.formName, FORM_NAME);
    assert.equal(filling.captionKey, 'stream');
    const submitted = sceneForElapsed(T_ACTION + 10);
    assert.equal(submitted.assistant, ASSISTANT_REPLY);
    assert.equal(submitted.formFocus, 'submit');
    assert.equal(submitted.formEmail, FORM_EMAIL);
    assert.equal(submitted.formOrder, FORM_ORDER);
    assert.equal(submitted.formMessage, FORM_MESSAGE);
    assert.equal(submitted.formSubmitPulse, true);
    assert.equal(submitted.captionKey, 'action');
});

test('completedScene: freezes on the filled support form', () => {
    const scene = completedScene();
    assert.equal(scene.view, 'sidepanel');
    assert.equal(scene.formName, FORM_NAME);
    assert.equal(scene.formFocus, 'submit');
    assert.equal(scene.assistant, ASSISTANT_REPLY);
    assert.equal(scene.loading, false);
    assert.equal(sceneForElapsed(FLOW_LOOP_MS - 1).view, 'sidepanel');
});

test('slidePlayForElapsed: editor creates an LWC then types the template', () => {
    const start = slidePlayForElapsed('editor', 0);
    assert.equal(start.editorTyped, '');
    assert.equal(start.bundleReady, false);
    assert.equal(start.paletteOpen, false);
    const done = completedSlidePlay('editor');
    assert.equal(done.bundleReady, true);
    assert.equal(done.editorTyped, LWC_HTML);
    assert.match(done.editorTyped, /<template>/);
    assert.equal(done.editorDirty, false);
    assert.equal(done.paletteOpen, false);
});

test('slidePlayForElapsed: metadata filters then selects Account', () => {
    const start = slidePlayForElapsed('workbench', 0);
    assert.equal(start.metaSelected, false);
    const done = completedSlidePlay('workbench');
    assert.equal(done.metaFilter, SEARCH_QUERY);
    assert.equal(done.metaSelected, true);
});

test('slidePlayForElapsed: SOQL types a query then shows results', () => {
    const start = slidePlayForElapsed('soql', 0);
    assert.equal(start.resultsVisible, false);
    const done = completedSlidePlay('soql');
    assert.equal(done.soqlDraft, SOQL_QUERY);
    assert.equal(done.resultsVisible, true);
});

test('slidePlayForElapsed: agent fills the Acme support form', () => {
    const start = slidePlayForElapsed('agent', 0);
    assert.equal(start.formName, '');
    assert.equal(start.formFocus, null);
    const done = completedSlidePlay('agent');
    assert.equal(done.formName, FORM_NAME);
    assert.equal(done.formEmail, FORM_EMAIL);
    assert.equal(done.formOrder, FORM_ORDER);
    assert.equal(done.formMessage, FORM_MESSAGE);
    assert.equal(done.formFocus, 'submit');
    assert.equal(done.assistant, ASSISTANT_REPLY);
});
