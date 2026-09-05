import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AUTHORED_HEIGHT, AUTHORED_WIDTH, spatialFixtureScale } from './slides';

export function SpatialFixture({ children }: { children: ReactNode }): ReactNode {
    const frameRef = useRef<HTMLDivElement>(null);
    const [geometry, setGeometry] = useState({
        scale: 1,
        height: AUTHORED_HEIGHT,
        offsetX: 0,
    });

    useLayoutEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const measure = () => {
            const scale = spatialFixtureScale(frame.clientWidth, AUTHORED_WIDTH);
            const height = AUTHORED_HEIGHT * scale;
            const offsetX = (frame.clientWidth - AUTHORED_WIDTH) / 2;
            setGeometry(current =>
                Math.abs(current.scale - scale) < 0.0001 &&
                Math.abs(current.height - height) < 0.5 &&
                Math.abs(current.offsetX - offsetX) < 0.5
                    ? current
                    : { scale, height, offsetX }
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={frameRef}
            data-tour-scale={geometry.scale.toFixed(4)}
            className="product-tour-spatial"
            style={{ height: geometry.height }}
        >
            <div
                className="product-tour-spatial-inner"
                style={
                    {
                        width: AUTHORED_WIDTH,
                        transform: `scale(${geometry.scale})`,
                        marginLeft: geometry.offsetX,
                    } as CSSProperties
                }
            >
                {children}
            </div>
        </div>
    );
}
