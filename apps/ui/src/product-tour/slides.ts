export const MAX_FIXTURE_SCALE = 1.2;

export const AUTHORED_WIDTH = 1100;
export const AUTHORED_HEIGHT = 540;

export type TourSlideId = 'overlay' | 'editor' | 'workbench' | 'soql' | 'agent';

export interface TourSlide {
    id: TourSlideId;
    url: string;
}

export const SLIDES: readonly TourSlide[] = [
    { id: 'overlay', url: 'acme.lightning.force.com/lightning/r/Account/001xx000003DHP0/view' },
    { id: 'editor', url: 'chrome - Workbench Editor' },
    { id: 'workbench', url: 'chrome - Metadata Explorer' },
    { id: 'soql', url: 'chrome - SOQL Explorer' },
    { id: 'agent', url: 'help.acme.com/support' },
];

export function spatialFixtureScale(
    availableWidth: number,
    authoredWidth: number,
    availableHeight?: number,
    authoredHeight?: number
): number {
    if (availableWidth <= 0 || authoredWidth <= 0) return 1;
    const heightScale =
        availableHeight !== undefined &&
        availableHeight > 0 &&
        authoredHeight !== undefined &&
        authoredHeight > 0
            ? availableHeight / authoredHeight
            : Number.POSITIVE_INFINITY;
    return Math.min(MAX_FIXTURE_SCALE, availableWidth / authoredWidth, heightScale);
}
