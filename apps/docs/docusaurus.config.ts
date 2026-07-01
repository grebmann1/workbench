import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
    title: 'Workbench Docs',
    tagline: 'Documentation for Workbench extension, desktop app, and workflows.',
    url: 'https://doc.sf-workbench.com',
    baseUrl: process.env.DOCS_BASE_PATH || '/',
    onBrokenLinks: 'warn',
    onBrokenMarkdownLinks: 'warn',
    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },
    presets: [
        [
            'classic',
            {
                docs: {
                    routeBasePath: '/',
                    sidebarPath: './sidebars.ts',
                    editUrl: undefined,
                },
                blog: false,
                pages: false,
                theme: {
                    customCss: './src/css/custom.css',
                },
                // GA4 must be configured as a preset option (not in themeConfig) since
                // Docusaurus 3.x — see https://github.com/facebook/docusaurus/pull/5832.
                // Spread-omitted when the env var is unset so analytics stays disabled.
                ...(process.env.VITE_GA_MEASUREMENT_ID && {
                    gtag: {
                        trackingID: process.env.VITE_GA_MEASUREMENT_ID,
                        anonymizeIP: true,
                    },
                }),
            } satisfies Preset.Options,
        ],
    ],
    themeConfig: {
        navbar: {
            title: 'Workbench Docs',
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'userSidebar',
                    position: 'left',
                    label: 'Functional',
                },
                {
                    type: 'docSidebar',
                    sidebarId: 'developerSidebar',
                    position: 'left',
                    label: 'Technical',
                },
                {
                    href: 'https://www.sf-workbench.com',
                    label: 'Website',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Functional',
                    items: [
                        { label: 'Installation', to: '/getting-started/installation' },
                        { label: 'Quickstart', to: '/getting-started/quickstart' },
                        { label: 'Applications', to: '/applications/overview' },
                        { label: 'AI Agent', to: '/ai-agent/setup' },
                        { label: 'Security', to: '/security/local-data-and-privacy' },
                        { label: 'Troubleshooting', to: '/troubleshooting/common-issues' },
                    ],
                },
                {
                    title: 'Technical',
                    items: [
                        { label: 'Architecture', to: '/architecture/overview' },
                        { label: 'VS Code', to: '/vscode/overview' },
                        { label: 'New Application', to: '/developer/new-application' },
                        { label: 'Local Storage', to: '/storage/indexeddb-workspace' },
                        { label: 'Contributing', to: '/contributing/how-to-contribute' },
                    ],
                },
                {
                    title: 'Product',
                    items: [
                        { label: 'Website', href: 'https://www.sf-workbench.com' },
                        {
                            label: 'Chrome Extension',
                            href: 'https://chromewebstore.google.com/detail/salesforce-toolkit/konbmllgicfccombdckckakhnmejjoei?hl=en',
                        },
                        { label: 'GitHub', href: 'https://github.com/grebmann1/workbench' },
                    ],
                },
            ],
            copyright: `Copyright ${new Date().getFullYear()} Workbench`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
            additionalLanguages: ['bash', 'json', 'typescript'],
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
