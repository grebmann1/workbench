import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import {
    ArrowLeft,
    ArrowUpRight,
    Bot,
    Check,
    Code2,
    Database,
    Layers,
    LayoutGrid,
    Maximize,
    Pause,
    Play,
    RotateCcw,
} from 'lucide-react';
import { CHROME_STORE_URL, FakeBrowser } from '../SiteChrome';
import { SlideWireframe } from '../product-tour/wireframes';
import { slideLoopMs, slidePlayForElapsed } from '../product-tour/slide-scene';
import { SLIDES, type TourSlideId } from '../product-tour/slides';
import workbenchLogo from '../product-tour/assets/workbench-logo-500.png';
import {
    CHAPTERS,
    FILM_DURATION,
    FILM_HEIGHT,
    FILM_WIDTH,
    captionIndex,
    chapterAt,
    clamp,
    ease,
    timestamp,
    type FilmChapter,
} from './story';
import './product-film.css';

declare global {
    interface Window {
        workbenchFilm?: { seek: (seconds: number) => void; duration: number };
    }
}

const featureIcons = {
    overlay: LayoutGrid,
    soql: Database,
    workbench: Layers,
    editor: Code2,
    agent: Bot,
};
const featureNames = {
    overlay: 'Overlay',
    soql: 'SOQL',
    workbench: 'Metadata',
    editor: 'Code editor',
    agent: 'AI agent',
};

function Brand({ large = false }: { large?: boolean }) {
    return (
        <div className={`film-brand${large ? ' film-brand--large' : ''}`}>
            <span className="film-mark">
                <img src={workbenchLogo} alt="" />
            </span>
            <span>
                Workbench 2.0<span className="film-brand-dot">.</span>
            </span>
        </div>
    );
}

function FeaturePills({ elapsed }: { elapsed: number }) {
    return (
        <div className="film-pills">
            {(Object.keys(featureNames) as TourSlideId[]).map((id, index) => {
                const Icon = featureIcons[id];
                const enter = ease((elapsed - index * 0.13) / 0.8);
                return (
                    <div
                        key={id}
                        style={{ opacity: enter, transform: `translateY(${(1 - enter) * 24}px)` }}
                    >
                        <Icon size={23} strokeWidth={1.6} />
                        <span>{featureNames[id]}</span>
                    </div>
                );
            })}
        </div>
    );
}

function TitleScene({ chapter, local }: { chapter: FilmChapter; local: number }) {
    const outro = chapter.id === 'outro';
    const titleEnter = ease((local + 0.9) / 1.2);
    return (
        <div className={`film-title-scene${outro ? ' film-title-scene--outro' : ''}`}>
            <div
                className="film-title-orbit film-title-orbit--one"
                style={{ transform: `rotate(${local * 2}deg)` }}
            />
            <div
                className="film-title-orbit film-title-orbit--two"
                style={{ transform: `rotate(${-local * 2}deg)` }}
            />
            <div className="film-title-content">
                <p className="film-eyebrow">
                    {outro ? 'JUST A GLIMPSE OF WORKBENCH 2.0' : 'MEET WORKBENCH 2.0'}
                </p>
                <h1
                    style={{
                        opacity: titleEnter,
                        transform: `translateY(${(1 - titleEnter) * 36}px)`,
                    }}
                >
                    {chapter.title.split('\n').map((line, index) => (
                        <span key={line} className={index === 1 ? 'film-accent' : undefined}>
                            {line}
                        </span>
                    ))}
                </h1>
                <p className="film-title-detail" style={{ opacity: ease((local - 0.6) / 1) }}>
                    {chapter.detail}
                </p>
                <FeaturePills elapsed={local - 1.1} />
                {outro && (
                    <div className="film-end-cta" style={{ opacity: ease((local - 2.1) / 0.8) }}>
                        <span className="film-install">
                            Add to Chrome <ArrowUpRight size={25} />
                        </span>
                        <span>sf-workbench.com</span>
                    </div>
                )}
            </div>
            <div className="film-title-footnote">
                {outro
                    ? 'Independent, community-built software for Salesforce.'
                    : 'DATA  /  METADATA  /  CODE  /  AI'}
            </div>
        </div>
    );
}

function WorkflowScene({ chapter, local }: { chapter: FilmChapter; local: number }) {
    const id = chapter.id as TourSlideId;
    const duration = chapter.end - chapter.start;
    const progress = clamp(local / duration);
    const step = Math.min(2, Math.floor(progress * 3));
    // Play each existing fixture once, leaving its completed state on screen to read.
    const sceneTime = clamp((local - 0.9) / (duration - 3.5)) * (slideLoopMs(id) - 2400);
    const play = slidePlayForElapsed(id, sceneTime);
    if (id === 'agent' && play.formFocus === 'submit') {
        play.assistant = 'Submitted the support form for order 1842.';
    }
    const Icon = featureIcons[id];
    const enter = ease(local / 0.8);
    const scale = 1 + ease(progress) * 0.012;
    const slide = SLIDES.find(item => item.id === id)!;
    return (
        <div className="film-workflow" style={{ transform: `translateY(${(1 - enter) * 24}px)` }}>
            <div className="film-workflow-heading">
                <p className="film-eyebrow">
                    <span />
                    {chapter.label}
                </p>
                <h1>{chapter.title}</h1>
                <p>{chapter.detail}</p>
            </div>
            <div className="film-step-rail">
                <span className="film-feature-icon">
                    <Icon size={32} strokeWidth={1.5} />
                </span>
                <span className="film-step-number">0{CHAPTERS.indexOf(chapter)}</span>
                <strong>{featureNames[id]}</strong>
                <div className="film-step-list">
                    {chapter.steps.map((label, index) => (
                        <div key={label} className={index <= step ? 'is-reached' : ''}>
                            <span>{index < step ? <Check size={14} /> : `0${index + 1}`}</span>
                            <p>{label}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div
                className="film-screen-wrap"
                style={{ transform: `translateY(${-ease(progress) * 5}px) scale(${scale})` }}
            >
                <div className="film-screen product-tour" style={{ transform: 'scale(1.32)' }}>
                    <FakeBrowser url={slide.url}>
                        <SlideWireframe slideId={id} play={play} showCursor={false} />
                    </FakeBrowser>
                </div>
            </div>
            <div className="film-workflow-caption">
                <span className="film-caption-dash" />
                <p>{chapter.captions[step]}</p>
            </div>
        </div>
    );
}

export function FilmCanvas({ seconds }: { seconds: number }) {
    const chapter = chapterAt(seconds);
    const local = seconds - chapter.start;
    const endFade = chapter.id === 'outro' ? 1 : ease((chapter.end - seconds) / 0.42);
    const style = { '--film-accent': chapter.accent } as CSSProperties;
    return (
        <div className="film-canvas" style={style}>
            <div
                className="film-glow"
                style={{
                    transform: `translate(${Math.sin(seconds / 16) * 90}px, ${Math.cos(seconds / 19) * 50}px)`,
                }}
            />
            <header className="film-topline">
                <Brand />
                <span>
                    A FEW POSSIBILITIES <i /> 01:18
                </span>
            </header>
            <div className="film-scene" style={{ opacity: endFade }}>
                {chapter.id === 'intro' || chapter.id === 'outro' ? (
                    <TitleScene chapter={chapter} local={local} />
                ) : (
                    <WorkflowScene chapter={chapter} local={local} />
                )}
            </div>
            <footer className="film-bottomline">
                <span>Illustrative demo · Sample org data</span>
                <span>SALESFORCE, WITH MORE POSSIBILITY.</span>
            </footer>
            <div className="film-chapter-track">
                {CHAPTERS.map(item => (
                    <div key={item.id} style={{ flex: item.end - item.start }}>
                        <span
                            style={{
                                transform: `scaleX(${clamp((seconds - item.start) / (item.end - item.start))})`,
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ProductFilm() {
    const capture = new URLSearchParams(window.location.search).has('capture');
    const [seconds, setSeconds] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [scale, setScale] = useState(1);
    const [fullscreenError, setFullscreenError] = useState('');
    const viewportRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef(0);
    const chapter = chapterAt(seconds);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const resize = () => setScale(viewport.clientWidth / FILM_WIDTH);
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!capture) return;
        window.workbenchFilm = {
            duration: FILM_DURATION,
            seek: value => flushSync(() => setSeconds(clamp(value, 0, FILM_DURATION))),
        };
        return () => {
            delete window.workbenchFilm;
        };
    }, [capture]);

    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        let previous: number | undefined;
        const tick = (now: number) => {
            if (previous !== undefined)
                timeRef.current = Math.min(
                    FILM_DURATION,
                    timeRef.current + (now - previous) / 1000
                );
            previous = now;
            setSeconds(timeRef.current);
            if (timeRef.current >= FILM_DURATION) setPlaying(false);
            else frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing]);

    function seek(value: number) {
        timeRef.current = clamp(value, 0, FILM_DURATION);
        setSeconds(timeRef.current);
    }

    function togglePlay() {
        if (timeRef.current >= FILM_DURATION) seek(0);
        setPlaying(value => !value);
    }

    return (
        <main className={`film-page${capture ? ' film-page--capture' : ''}`}>
            {!capture && (
                <header className="film-page-header">
                    <a href="/">
                        <ArrowLeft size={18} /> Back to Workbench
                    </a>
                    <span>78 seconds. A few of Workbench 2.0’s capabilities.</span>
                    <a href={CHROME_STORE_URL} className="film-page-install">
                        Add to Chrome <ArrowUpRight size={17} />
                    </a>
                </header>
            )}
            <div ref={playerRef} className="film-player">
                <div
                    ref={viewportRef}
                    className="film-viewport"
                    style={{ aspectRatio: `${FILM_WIDTH} / ${FILM_HEIGHT}` }}
                >
                    <div
                        className="film-scaled"
                        style={{ transform: `scale(${scale})` }}
                        inert
                        aria-hidden="true"
                    >
                        <FilmCanvas seconds={seconds} />
                    </div>
                </div>
                {!capture && (
                    <div className="film-controls">
                        <button
                            onClick={togglePlay}
                            aria-label={
                                playing
                                    ? 'Pause film'
                                    : seconds >= FILM_DURATION
                                      ? 'Replay film'
                                      : 'Play film'
                            }
                        >
                            {playing ? (
                                <Pause size={20} />
                            ) : seconds >= FILM_DURATION ? (
                                <RotateCcw size={20} />
                            ) : (
                                <Play size={20} />
                            )}
                        </button>
                        <span className="film-time">
                            {timestamp(seconds)} / {timestamp(FILM_DURATION)}
                        </span>
                        <input
                            type="range"
                            min="0"
                            max={FILM_DURATION}
                            step="0.1"
                            value={seconds}
                            onChange={event => seek(Number(event.target.value))}
                            aria-label="Film position"
                            aria-valuetext={`${timestamp(seconds)} — ${chapter.label}`}
                        />
                        <button aria-label="Restart film" onClick={() => seek(0)}>
                            <RotateCcw size={18} />
                        </button>
                        <button
                            aria-label="Toggle fullscreen"
                            onClick={async () => {
                                try {
                                    if (document.fullscreenElement) await document.exitFullscreen();
                                    else await playerRef.current?.requestFullscreen();
                                } catch {
                                    setFullscreenError(
                                        'Fullscreen is unavailable in this browser.'
                                    );
                                }
                            }}
                        >
                            <Maximize size={18} />
                        </button>
                    </div>
                )}
            </div>
            {!capture && (
                <div className="film-below">
                    <div className="film-now">
                        <h1>{chapter.label}</h1>
                        <p>{chapter.captions[captionIndex(chapter, seconds)]}</p>
                    </div>
                    <nav className="film-chapters" aria-label="Film chapters">
                        {CHAPTERS.map(item => (
                            <button
                                key={item.id}
                                aria-current={chapter.id === item.id ? 'step' : undefined}
                                onClick={() => seek(item.start)}
                            >
                                <span>{timestamp(item.start)}</span>
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    {fullscreenError && <p role="status">{fullscreenError}</p>}
                    <details className="film-transcript">
                        <summary>Read the film transcript</summary>
                        {CHAPTERS.map(item => (
                            <section key={item.id}>
                                <h2>
                                    {timestamp(item.start)} · {item.label}
                                </h2>
                                <p>{item.captions.join(' ')}</p>
                            </section>
                        ))}
                    </details>
                </div>
            )}
        </main>
    );
}
