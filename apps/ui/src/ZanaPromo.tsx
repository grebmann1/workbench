import { useTranslation } from 'react-i18next';
import { ZANA_URL } from './SiteChrome';
import zanaLogo from './assets/zana-logo.svg';

export function ZanaPromo() {
    const { t } = useTranslation();
    return (
        <section id="zana" className="zana-promo" aria-labelledby="zana-title">
            <img className="zana-promo-logo" src={zanaLogo} alt="" width="72" height="72" />
            <div className="zana-promo-body">
                <p className="section-kicker">{t('home.zana.eyebrow')}</p>
                <h2 id="zana-title">{t('home.zana.title')}</h2>
                <p className="zana-promo-text">{t('home.zana.description')}</p>
                <p className="zana-promo-requirement">{t('home.zana.requirement')}</p>
            </div>
            <div className="zana-promo-actions">
                <a className="button" href="/zana">
                    {t('home.zana.learnMore')}
                </a>
                <a
                    className="button button-ghost"
                    href={ZANA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {t('home.zana.cta')}
                </a>
            </div>
        </section>
    );
}
