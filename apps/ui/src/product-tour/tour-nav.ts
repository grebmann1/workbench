import { createContext, useContext } from 'react';
import type { TourSlideId } from './slides';

export const TourNavContext = createContext<((slideId: TourSlideId) => void) | null>(null);

export function useTourNav(): ((slideId: TourSlideId) => void) | null {
    return useContext(TourNavContext);
}
