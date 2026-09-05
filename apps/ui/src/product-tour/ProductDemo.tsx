import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FakeBrowser } from '../SiteChrome';
import {
    completedScene,
    demoUrlForView,
    FLOW_LOOP_MS,
    headingForView,
    sceneForElapsed,
} from './flow-scene';
import { SpatialFixture } from './SpatialFixture';
import { HomeFlowWireframe, SlideWireframe } from './wireframes';
import type { TourSlideId } from './slides';
import { completedSlidePlay, slideLoopMs, slidePlayForElapsed } from './slide-scene';

function usePrefersReducedMotion(): boolean {
    const [reduce, setReduce] = useState(false);
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduce(media.matches);
        const onChange = () => setReduce(media.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);
    return reduce;
}

function useTourElapsed(loopMs: number, enabled: boolean): number {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!enabled || loopMs <= 0) return;
        let frame = 0;
        const origin = performance.now();
        const tick = (now: number) => {
            setElapsed((now - origin) % loopMs);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled, loopMs]);
    return elapsed;
}

export function ProductDemo(): ReactNode {
    const { t } = useTranslation();
    const reduceMotion = usePrefersReducedMotion();
    const elapsed = useTourElapsed(FLOW_LOOP_MS, !reduceMotion);
    const lastElapsed = useRef(elapsed);
    const [loopGen, setLoopGen] = useState(0);
    const scene = reduceMotion ? completedScene() : sceneForElapsed(elapsed);
    const heading = headingForView(scene.view);

    useEffect(() => {
        if (reduceMotion) {
            lastElapsed.current = elapsed;
            return;
        }
        if (elapsed + 200 < lastElapsed.current) {
            setLoopGen(gen => gen + 1);
        }
        lastElapsed.current = elapsed;
    }, [elapsed, reduceMotion]);

    return (
        <div className="product-tour" data-tour-demo>
            <section aria-label={t('home.demo.ariaLabel')}>
                <header className="product-tour-heading">
                    <h2 key={heading} className="pt-copy-fade">
                        {t(`home.demo.headings.${heading}`)}
                    </h2>
                    <p key={scene.captionKey} className="pt-copy-fade">
                        {t(`home.demo.captions.${scene.captionKey}`)}
                    </p>
                </header>
                <SpatialFixture>
                    <FakeBrowser url={demoUrlForView(scene.view)}>
                        <HomeFlowWireframe
                            scene={scene}
                            loopGen={loopGen}
                            showCursor={!reduceMotion}
                        />
                    </FakeBrowser>
                </SpatialFixture>
                <p className="product-tour-more">
                    <a className="button button-ghost button-small" href="#overlay">
                        {t('home.demo.seeAllFeatures')}
                    </a>
                </p>
            </section>
        </div>
    );
}

export function FeatureSlide({ slideId, url }: { slideId: TourSlideId; url: string }): ReactNode {
    const reduceMotion = usePrefersReducedMotion();
    const rootRef = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
            threshold: 0.35,
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const loopMs = slideLoopMs(slideId);
    const elapsed = useTourElapsed(loopMs, inView && !reduceMotion);
    const play =
        inView && !reduceMotion
            ? slidePlayForElapsed(slideId, elapsed)
            : completedSlidePlay(slideId);

    return (
        <div ref={rootRef}>
            <SpatialFixture>
                <FakeBrowser url={url}>
                    <SlideWireframe
                        slideId={slideId}
                        play={play}
                        showCursor={inView && !reduceMotion}
                    />
                </FakeBrowser>
            </SpatialFixture>
        </div>
    );
}
