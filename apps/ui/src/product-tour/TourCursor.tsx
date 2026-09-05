import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import type { CursorTarget } from './flow-scene';

export function TourCursor({
    stageRef,
    target,
    clicking,
    hidden,
}: {
    stageRef: RefObject<HTMLElement | null>;
    target: CursorTarget;
    clicking: boolean;
    hidden: boolean;
}): ReactNode {
    const [pos, setPos] = useState({ x: 48, y: 120 });
    const [clickGen, setClickGen] = useState(0);

    useLayoutEffect(() => {
        if (clicking) setClickGen(gen => gen + 1);
    }, [clicking]);

    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage || !target) return;
        const measure = () => {
            const el =
                stage.querySelector(`.pt-view-layer.is-current [data-pt-target="${target}"]`) ??
                stage.querySelector(`[data-pt-target="${target}"]`);
            if (!(el instanceof HTMLElement)) return;
            const stageBox = stage.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            const x = box.left - stageBox.left + box.width * 0.65;
            const y = box.top - stageBox.top + box.height * 0.55;
            setPos(current =>
                Math.abs(current.x - x) < 0.5 && Math.abs(current.y - y) < 0.5 ? current : { x, y }
            );
        };
        measure();
        const frame = requestAnimationFrame(measure);
        const observer = new ResizeObserver(measure);
        observer.observe(stage);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [stageRef, target]);

    return (
        <div
            className={`pt-cursor${hidden || !target ? ' is-hidden' : ''}${clicking ? ' is-click' : ''}`}
            data-click={clickGen}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            aria-hidden
        >
            <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                    d="M4.2 2.4 19.6 14.2l-6.4.4 3.1 7.2-2.9 1.2-3.1-7.1L4.2 21.6V2.4Z"
                    fill="#fff"
                    stroke="#032d60"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
}
