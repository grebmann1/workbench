import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n';
import App from './App';
import Welcome from './Welcome';
import './styles.css';
import './product-tour/product-tour.css';

declare global {
    interface Window {
        dataLayer?: IArguments[];
        gtag?: (...args: unknown[]) => void;
    }
}

const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
if (gaId) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer?.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
}

const isWelcomePath = window.location.pathname.startsWith('/welcome');
const ProductFilm = lazy(() => import('./product-film/ProductFilm'));
const isFilmPath = window.location.pathname.replace(/\/$/, '') === '/film';
const Root = isFilmPath ? ProductFilm : isWelcomePath ? Welcome : App;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Suspense fallback={<p role="status">Loading…</p>}>
            <Root />
        </Suspense>
    </StrictMode>
);
