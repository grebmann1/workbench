import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppPreview } from './AppPreview';
import { VIEW_FADE_MS, type FlowScene, type FlowView } from './flow-scene';
import { AUTHORED_HEIGHT, AUTHORED_WIDTH, type TourSlideId } from './slides';
import { completedSlidePlay, cursorTargetForPlay, type SlidePlay } from './slide-scene';
import { TourCursor } from './TourCursor';

function playFromFlow(scene: FlowScene): SlidePlay {
    return {
        ...completedSlidePlay('overlay'),
        ...scene,
        overlayCaret: scene.caret === 'search',
        soqlCaret: scene.caret === 'soql',
        editorCaret: scene.caret === 'editor',
        paletteCaret: scene.caret === 'palette',
        streaming: Boolean(scene.assistant) && scene.formFocus !== 'submit',
    };
}

function slideForView(view: FlowView): TourSlideId {
    return view === 'salesforce' ? 'overlay' : view === 'sidepanel' ? 'agent' : view;
}

function useHeldView(view: FlowView) {
    const [current, setCurrent] = useState(view);
    const [outgoing, setOutgoing] = useState<FlowView | null>(null);
    useEffect(() => {
        if (view === current) return;
        setOutgoing(current);
        setCurrent(view);
    }, [view, current]);
    useEffect(() => {
        if (!outgoing) return;
        const timer = window.setTimeout(() => setOutgoing(null), VIEW_FADE_MS);
        return () => window.clearTimeout(timer);
    }, [outgoing]);
    return { current, outgoing };
}

export function HomeFlowWireframe({
    scene,
    loopGen = 0,
    showCursor,
}: {
    scene: FlowScene;
    loopGen?: number;
    showCursor?: boolean;
}): ReactNode {
    const stageRef = useRef<HTMLDivElement>(null);
    const { current, outgoing } = useHeldView(scene.view);
    const play = playFromFlow(scene);
    return (
        <div
            ref={stageRef}
            className="pt-stage"
            data-flow-view={scene.view}
            data-loop-gen={loopGen > 0 ? loopGen : undefined}
            style={{ width: AUTHORED_WIDTH, height: AUTHORED_HEIGHT }}
        >
            {outgoing && (
                <div className="pt-view-layer is-exit">
                    <AppPreview slideId={slideForView(outgoing)} play={play} />
                </div>
            )}
            <div className={`pt-view-layer is-current${outgoing ? ' is-enter' : ''}`}>
                <AppPreview slideId={slideForView(current)} play={play} />
            </div>
            {scene.loadingTarget && (
                <div className="pt-loading" aria-hidden>
                    <span className="pt-spinner" />
                    Opening {scene.loadingTarget === 'editor' ? 'VS Code' : 'SOQL Explorer'}…
                </div>
            )}
            <TourCursor
                stageRef={stageRef}
                target={scene.cursorTarget}
                clicking={scene.vscodeHot || scene.sendPulse}
                hidden={!showCursor || scene.loading || scene.view === 'sidepanel'}
            />
        </div>
    );
}

export function SlideWireframe({
    slideId,
    play,
    showCursor,
}: {
    slideId: TourSlideId;
    play?: SlidePlay;
    showCursor?: boolean;
}): ReactNode {
    const stageRef = useRef<HTMLDivElement>(null);
    const scene = play ?? completedSlidePlay(slideId);
    return (
        <div
            ref={stageRef}
            className="pt-stage"
            data-tour-slide={slideId}
            style={{ width: AUTHORED_WIDTH, height: AUTHORED_HEIGHT }}
        >
            <div className="pt-view-layer is-current">
                <AppPreview slideId={slideId} play={scene} />
            </div>
            <TourCursor
                stageRef={stageRef}
                target={cursorTargetForPlay(scene)}
                clicking={scene.vscodeHot || scene.sendPulse}
                hidden={!showCursor || slideId === 'agent'}
            />
        </div>
    );
}
