import { useTranslation } from 'react-i18next';
import { SiteShell, ZANA_GITHUB_URL, ZANA_URL } from './SiteChrome';
import zanaLogo from './assets/zana-logo.svg';

const FEATURES = ['query', 'apex', 'metadata', 'open'] as const;

export default function Zana() {
    const { t } = useTranslation();
    return (
        <SiteShell>
            <section className="zana-hero" aria-labelledby="zana-page-title">
                <img className="zana-hero-logo" src={zanaLogo} alt="" width="96" height="96" />
                <p className="eyebrow">{t('zanaPage.eyebrow')}</p>
                <h1 id="zana-page-title">{t('zanaPage.title')}</h1>
                <p className="hero-text">{t('zanaPage.body')}</p>
                <div className="hero-actions">
                    <a className="button" href={ZANA_URL} target="_blank" rel="noopener noreferrer">
                        {t('home.zana.cta')}
                    </a>
                    <a
                        className="button button-ghost"
                        href={ZANA_GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {t('home.zana.source')}
                    </a>
                </div>
            </section>

            <section className="zana-features" aria-labelledby="zana-features-title">
                <div className="section-heading">
                    <p className="section-kicker">{t('zanaPage.featuresKicker')}</p>
                    <h2 id="zana-features-title">{t('zanaPage.featuresTitle')}</h2>
                </div>
                <div className="zana-feature-grid">
                    {FEATURES.map(id => (
                        <article key={id} className="platform-card">
                            <div className="platform-body">
                                <h3>{t(`zanaPage.${id}.title`)}</h3>
                                <p>{t(`zanaPage.${id}.body`)}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="download" aria-labelledby="zana-cta-title">
                <h2 id="zana-cta-title">{t('zanaPage.ctaTitle')}</h2>
                <p>{t('zanaPage.ctaBody')}</p>
                <p className="zana-promo-requirement">
                    <strong>{t('zanaPage.reqTitle')}</strong> — {t('zanaPage.reqBody')}
                </p>
                <div className="hero-actions">
                    <a className="button" href={ZANA_URL} target="_blank" rel="noopener noreferrer">
                        {t('home.zana.cta')}
                    </a>
                    <a className="button button-ghost" href="/">
                        {t('zanaPage.back')}
                    </a>
                </div>
            </section>
        </SiteShell>
    );
}
