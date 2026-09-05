import {
    ASSISTANT_REPLY,
    CHAR_MS,
    FORM_EMAIL,
    FORM_MESSAGE,
    FORM_NAME,
    FORM_ORDER,
    LWC_BUNDLE,
    LWC_HTML,
    PALETTE_QUERY,
    SEARCH_QUERY,
    SOQL_QUERY,
    STREAM_MS,
    inRange,
    typed,
    type FormFocus,
    type PalettePhase,
} from './flow-scene.ts';
import type { TourSlideId } from './slides';

export interface SlidePlay {
    overlayOpen: boolean;
    overlaySearch: string;
    overlayCaret: boolean;
    vscodeHot: boolean;
    soqlHot: boolean;
    soqlDraft: string;
    soqlCaret: boolean;
    resultsVisible: boolean;
    sendPulse: boolean;
    assistant: string;
    streaming: boolean;
    paletteOpen: boolean;
    palettePhase: PalettePhase;
    paletteQuery: string;
    paletteName: string;
    paletteCaret: boolean;
    bundleReady: boolean;
    editorTyped: string;
    editorCaret: boolean;
    editorDirty: boolean;
    metaFilter: string;
    metaCaret: boolean;
    metaSelected: boolean;
    formFocus: FormFocus;
    formName: string;
    formEmail: string;
    formOrder: string;
    formMessage: string;
    formSubmitPulse: boolean;
}

const HOLD_MS = 2800;

function emptyPlay(): SlidePlay {
    return {
        overlayOpen: false,
        overlaySearch: '',
        overlayCaret: false,
        vscodeHot: false,
        soqlHot: false,
        soqlDraft: '',
        soqlCaret: false,
        resultsVisible: false,
        sendPulse: false,
        assistant: '',
        streaming: false,
        paletteOpen: false,
        palettePhase: null,
        paletteQuery: '',
        paletteName: '',
        paletteCaret: false,
        bundleReady: false,
        editorTyped: '',
        editorCaret: false,
        editorDirty: false,
        metaFilter: '',
        metaCaret: false,
        metaSelected: false,
        formFocus: null,
        formName: '',
        formEmail: '',
        formOrder: '',
        formMessage: '',
        formSubmitPulse: false,
    };
}

function overlayLoop(now: number): { play: SlidePlay; loopMs: number } {
    const openAt = 700;
    const typeAt = 1500;
    const typedDone = typeAt + SEARCH_QUERY.length * CHAR_MS;
    const loopMs = typedDone + 400 + HOLD_MS;
    return {
        loopMs,
        play: {
            ...emptyPlay(),
            overlayOpen: now >= openAt,
            overlaySearch: typed(SEARCH_QUERY, typeAt, now, CHAR_MS),
            overlayCaret: inRange(now, typeAt, typedDone + 200),
        },
    };
}

function editorLoop(now: number): { play: SlidePlay; loopMs: number } {
    const paletteAt = 250;
    const typeCmd = paletteAt + 160;
    const cmdDone = typeCmd + PALETTE_QUERY.length * CHAR_MS + 380;
    const typeName = cmdDone + 180;
    const bundleAt = typeName + LWC_BUNDLE.length * CHAR_MS + 320;
    const typeHtml = bundleAt + 280;
    const htmlDone = typeHtml + LWC_HTML.length * STREAM_MS;
    const loopMs = htmlDone + HOLD_MS;
    let palettePhase: PalettePhase = null;
    if (inRange(now, paletteAt, cmdDone)) palettePhase = 'command';
    else if (inRange(now, cmdDone, bundleAt)) palettePhase = 'name';
    return {
        loopMs,
        play: {
            ...emptyPlay(),
            paletteOpen: palettePhase !== null,
            palettePhase,
            paletteQuery: typed(PALETTE_QUERY, typeCmd, now, CHAR_MS),
            paletteName: typed(LWC_BUNDLE, typeName, now, CHAR_MS),
            paletteCaret: inRange(now, typeCmd, bundleAt),
            bundleReady: now >= bundleAt,
            editorTyped: typed(LWC_HTML, typeHtml, now, STREAM_MS),
            editorCaret: inRange(now, typeHtml, htmlDone + 180),
            editorDirty: now >= typeHtml && now < htmlDone,
        },
    };
}

function workbenchLoop(now: number): { play: SlidePlay; loopMs: number } {
    const typeAt = 500;
    const typedDone = typeAt + SEARCH_QUERY.length * CHAR_MS;
    const selectAt = typedDone + 450;
    const loopMs = selectAt + HOLD_MS;
    return {
        loopMs,
        play: {
            ...emptyPlay(),
            metaFilter: typed(SEARCH_QUERY, typeAt, now, CHAR_MS),
            metaCaret: inRange(now, typeAt, typedDone + 160),
            metaSelected: now >= selectAt,
        },
    };
}

function soqlLoop(now: number): { play: SlidePlay; loopMs: number } {
    const typeAt = 400;
    const typedDone = typeAt + SOQL_QUERY.length * CHAR_MS;
    const runAt = typedDone + 220;
    const resultsAt = runAt + 480;
    const loopMs = resultsAt + HOLD_MS;
    return {
        loopMs,
        play: {
            ...emptyPlay(),
            soqlDraft: typed(SOQL_QUERY, typeAt, now, CHAR_MS),
            soqlCaret: inRange(now, typeAt, runAt),
            sendPulse: inRange(now, runAt, resultsAt),
            resultsVisible: now >= resultsAt,
        },
    };
}

function agentLoop(now: number): { play: SlidePlay; loopMs: number } {
    const streamAt = 400;
    const nameAt = 650;
    const emailAt = nameAt + 600;
    const orderAt = emailAt + 600;
    const messageAt = orderAt + 600;
    const submitAt = messageAt + 700;
    const loopMs = submitAt + HOLD_MS;
    const assistant = typed(ASSISTANT_REPLY, streamAt, now, STREAM_MS);
    let formFocus: FormFocus = null;
    if (now >= submitAt) formFocus = 'submit';
    else if (now >= messageAt) formFocus = 'message';
    else if (now >= orderAt) formFocus = 'order';
    else if (now >= emailAt) formFocus = 'email';
    else if (now >= nameAt) formFocus = 'name';
    return {
        loopMs,
        play: {
            ...emptyPlay(),
            assistant,
            streaming: inRange(now, streamAt, submitAt),
            formFocus,
            formName: now >= nameAt ? FORM_NAME : '',
            formEmail: now >= emailAt ? FORM_EMAIL : '',
            formOrder: now >= orderAt ? FORM_ORDER : '',
            formMessage: now >= messageAt ? FORM_MESSAGE : '',
            formSubmitPulse: inRange(now, submitAt, submitAt + 900),
        },
    };
}

function loopFor(id: TourSlideId, now: number): { play: SlidePlay; loopMs: number } {
    if (id === 'overlay') return overlayLoop(now);
    if (id === 'editor') return editorLoop(now);
    if (id === 'workbench') return workbenchLoop(now);
    if (id === 'soql') return soqlLoop(now);
    return agentLoop(now);
}

export function slideLoopMs(id: TourSlideId): number {
    return loopFor(id, 0).loopMs;
}

export function slidePlayForElapsed(id: TourSlideId, ms: number): SlidePlay {
    const now = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    return loopFor(id, now).play;
}

export function completedSlidePlay(id: TourSlideId): SlidePlay {
    return slidePlayForElapsed(id, slideLoopMs(id) - HOLD_MS + 200);
}
