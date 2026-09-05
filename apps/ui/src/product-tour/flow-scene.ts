export type FlowView = 'salesforce' | 'editor' | 'soql' | 'sidepanel';

export type CaptionKey =
    | 'edge'
    | 'overlay'
    | 'search'
    | 'vscode'
    | 'loadingEditor'
    | 'typeCode'
    | 'editorReady'
    | 'loading'
    | 'toolkit'
    | 'query'
    | 'results'
    | 'ask'
    | 'stream'
    | 'action';

export type CaretTarget = 'search' | 'editor' | 'soql' | 'palette' | null;

export type LoadingTarget = 'editor' | 'soql' | null;

export type PalettePhase = 'command' | 'name' | null;

export type FormFocus = 'name' | 'email' | 'order' | 'message' | 'submit' | null;

export interface FlowScene {
    view: FlowView;
    overlayOpen: boolean;
    overlaySearch: string;
    soqlDraft: string;
    resultsVisible: boolean;
    loading: boolean;
    loadingTarget: LoadingTarget;
    assistant: string;
    caret: CaretTarget;
    vscodeHot: boolean;
    soqlHot: boolean;
    sendPulse: boolean;
    paletteOpen: boolean;
    palettePhase: PalettePhase;
    paletteQuery: string;
    paletteName: string;
    bundleReady: boolean;
    editorTyped: string;
    editorDirty: boolean;
    formFocus: FormFocus;
    formName: string;
    formEmail: string;
    formOrder: string;
    formMessage: string;
    formSubmitPulse: boolean;
    captionKey: CaptionKey;
}

export const SEARCH_QUERY = 'Account';
export const SOQL_QUERY = 'SELECT Id, Name, Industry FROM Account LIMIT 10';
export const PALETTE_QUERY = 'Create LWC';
export const LWC_BUNDLE = 'accountHighlight';
export const LWC_HTML = `<template>
  <lightning-card title={name}>
    <p class="slds-p-horizontal_small">{industry}</p>
  </lightning-card>
</template>`;
export const FORM_NAME = 'Alex Rivera';
export const FORM_EMAIL = 'alex@acme.com';
export const FORM_ORDER = '1842';
export const FORM_MESSAGE = 'Need help with the Acme Corp shipment.';
export const ASSISTANT_REPLY = 'Filled name, email, and order 1842. Ready to send.';

export const CHAR_MS = 42;
export const STREAM_MS = 22;

const searchDur = SEARCH_QUERY.length * CHAR_MS;
const paletteDur = PALETTE_QUERY.length * CHAR_MS;
const bundleDur = LWC_BUNDLE.length * CHAR_MS;
const htmlDur = LWC_HTML.length * STREAM_MS;
const queryDur = SOQL_QUERY.length * CHAR_MS;

export const T = {
    overlayOpen: 900,
    typeSearch: 1800,
} as const;

export const T_SEARCH_DONE = T.typeSearch + searchDur + 380;
export const T_VSCODE_PULSE = T_SEARCH_DONE + 180;
export const T_LOADING_EDITOR = T_VSCODE_PULSE + 900;
export const T_EDITOR = T_LOADING_EDITOR + 1200;
export const T_PALETTE = T_EDITOR + 280;
export const T_TYPE_PALETTE = T_PALETTE + 180;
export const T_PALETTE_PICK = T_TYPE_PALETTE + paletteDur + 420;
export const T_TYPE_BUNDLE = T_PALETTE_PICK + 220;
export const T_BUNDLE = T_TYPE_BUNDLE + bundleDur + 380;
export const T_TYPE_HTML = T_BUNDLE + 320;
export const T_HTML_DONE = T_TYPE_HTML + htmlDur + 420;
export const T_LOADING_SOQL = T_HTML_DONE + 700;
export const T_SOQL = T_LOADING_SOQL + 1200;
export const T_TYPE_QUERY = T_SOQL + 420;
export const T_RUN = T_TYPE_QUERY + queryDur + 280;
export const T_RESULTS = T_RUN + 520;
export const T_SIDEPANEL = T_RESULTS + 1600;
export const T_STREAM = T_SIDEPANEL + 480;
export const T_FORM_NAME = T_SIDEPANEL + 700;
export const T_FORM_EMAIL = T_FORM_NAME + 650;
export const T_FORM_ORDER = T_FORM_EMAIL + 650;
export const T_FORM_MESSAGE = T_FORM_ORDER + 650;
export const T_FORM_SUBMIT = T_FORM_MESSAGE + 800;
export const T_ACTION = T_FORM_SUBMIT;
export const FLOW_LOOP_MS = T_FORM_SUBMIT + 3200;

export function typed(text: string, start: number, now: number, msPerChar: number): string {
    if (now < start) return '';
    const chars = Math.floor((now - start) / msPerChar);
    return text.slice(0, Math.max(0, Math.min(text.length, chars)));
}

export function inRange(now: number, start: number, end: number): boolean {
    return now >= start && now < end;
}

function captionFor(now: number): CaptionKey {
    if (now >= T_FORM_SUBMIT) return 'action';
    if (now >= T_FORM_NAME) return 'stream';
    if (now >= T_SIDEPANEL) return 'ask';
    if (now >= T_RESULTS) return 'results';
    if (now >= T_TYPE_QUERY) return 'query';
    if (now >= T_SOQL) return 'toolkit';
    if (now >= T_LOADING_SOQL) return 'loading';
    if (now >= T_HTML_DONE) return 'editorReady';
    if (now >= T_TYPE_HTML) return 'typeCode';
    if (now >= T_BUNDLE) return 'typeCode';
    if (now >= T_PALETTE) return 'typeCode';
    if (now >= T_EDITOR) return 'typeCode';
    if (now >= T_LOADING_EDITOR) return 'loadingEditor';
    if (now >= T_VSCODE_PULSE) return 'vscode';
    if (now >= T.typeSearch) return 'search';
    if (now >= T.overlayOpen) return 'overlay';
    return 'edge';
}

export function headingForView(view: FlowView): 'overlay' | 'editor' | 'soql' | 'agent' {
    if (view === 'editor') return 'editor';
    if (view === 'soql') return 'soql';
    if (view === 'sidepanel') return 'agent';
    return 'overlay';
}

function formFocusFor(now: number): FormFocus {
    if (now >= T_FORM_SUBMIT) return 'submit';
    if (now >= T_FORM_MESSAGE) return 'message';
    if (now >= T_FORM_ORDER) return 'order';
    if (now >= T_FORM_EMAIL) return 'email';
    if (now >= T_FORM_NAME) return 'name';
    return null;
}

export function sceneForElapsed(ms: number): FlowScene {
    const now = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const loadingTarget: LoadingTarget = inRange(now, T_LOADING_EDITOR, T_EDITOR)
        ? 'editor'
        : inRange(now, T_LOADING_SOQL, T_SOQL)
          ? 'soql'
          : null;
    const view: FlowView =
        now >= T_SIDEPANEL
            ? 'sidepanel'
            : now >= T_SOQL
              ? 'soql'
              : now >= T_EDITOR
                ? 'editor'
                : 'salesforce';

    let palettePhase: PalettePhase = null;
    if (inRange(now, T_PALETTE, T_PALETTE_PICK)) palettePhase = 'command';
    else if (inRange(now, T_PALETTE_PICK, T_BUNDLE)) palettePhase = 'name';

    let caret: CaretTarget = null;
    if (inRange(now, T.typeSearch, T_SEARCH_DONE)) caret = 'search';
    else if (inRange(now, T_TYPE_PALETTE, T_BUNDLE)) caret = 'palette';
    else if (inRange(now, T_TYPE_HTML, T_HTML_DONE)) caret = 'editor';
    else if (inRange(now, T_TYPE_QUERY, T_RUN)) caret = 'soql';

    const focus = formFocusFor(now);

    return {
        view,
        overlayOpen: now >= T.overlayOpen,
        overlaySearch: typed(SEARCH_QUERY, T.typeSearch, now, CHAR_MS),
        soqlDraft: typed(SOQL_QUERY, T_TYPE_QUERY, now, CHAR_MS),
        resultsVisible: now >= T_RESULTS,
        loading: loadingTarget !== null,
        loadingTarget,
        assistant: typed(ASSISTANT_REPLY, T_STREAM, now, STREAM_MS),
        caret,
        vscodeHot: inRange(now, T_VSCODE_PULSE, T_LOADING_EDITOR),
        soqlHot: false,
        sendPulse: inRange(now, T_RUN, T_RESULTS),
        paletteOpen: palettePhase !== null,
        palettePhase,
        paletteQuery: typed(PALETTE_QUERY, T_TYPE_PALETTE, now, CHAR_MS),
        paletteName: typed(LWC_BUNDLE, T_TYPE_BUNDLE, now, CHAR_MS),
        bundleReady: now >= T_BUNDLE,
        editorTyped: typed(LWC_HTML, T_TYPE_HTML, now, STREAM_MS),
        editorDirty: now >= T_TYPE_HTML && now < T_HTML_DONE + 350,
        formFocus: focus,
        formName: now >= T_FORM_NAME ? FORM_NAME : '',
        formEmail: now >= T_FORM_EMAIL ? FORM_EMAIL : '',
        formOrder: now >= T_FORM_ORDER ? FORM_ORDER : '',
        formMessage: now >= T_FORM_MESSAGE ? FORM_MESSAGE : '',
        formSubmitPulse: inRange(now, T_FORM_SUBMIT, T_FORM_SUBMIT + 900),
        captionKey: captionFor(now),
    };
}

export function completedScene(): FlowScene {
    return sceneForElapsed(T_FORM_SUBMIT + 100);
}

export function demoUrlForView(view: FlowView): string {
    if (view === 'salesforce') {
        return 'acme.lightning.force.com/lightning/r/Account/001xx000003DHP0/view';
    }
    if (view === 'editor') {
        return 'chrome - Workbench Editor';
    }
    if (view === 'sidepanel') {
        return 'help.acme.com/support';
    }
    return 'chrome-extension://workbench/views/app.html';
}
