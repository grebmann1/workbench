import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
    Code2,
    Files,
    GitBranch,
    LayoutGrid,
    Menu,
    Play,
    Settings,
    SquareTerminal,
} from 'lucide-react';
import type { SlidePlay } from './slide-scene';
import type { TourSlideId } from './slides';
import { useTourNav } from './tour-nav';
import {
    PREVIEW_ACCOUNTS,
    PREVIEW_MENU_GROUPS,
    PREVIEW_METADATA_TYPES,
    PREVIEW_OBJECTS,
    PREVIEW_ORG,
    PREVIEW_VERSION,
} from './constants';
import icons from './assets/app-icons.svg';
import emptyState from './assets/empty-state.svg';
import extensionIcon from './assets/workbench-logo-128.png';
import './app-preview.css';

function cx(...values: Array<string | false | undefined>): string {
    return values.filter(Boolean).join(' ');
}

export function AppIcon({
    name,
    standard = false,
    size = 12,
}: {
    name: string;
    standard?: boolean;
    size?: number;
}) {
    return (
        <svg width={size} height={size} className="ap-icon" aria-hidden="true">
            <use href={`${icons}#${standard ? 'standard' : 'utility'}-${name}`} />
        </svg>
    );
}

function IconButton({
    icon,
    label,
    active = false,
    target,
    onClick,
}: {
    icon: string;
    label: string;
    active?: boolean;
    target?: string;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            className={cx('ap-icon-button', active && 'is-active')}
            aria-label={label}
            title={label}
            data-pt-target={target}
            onClick={onClick}
        >
            <AppIcon name={icon} />
        </button>
    );
}

function SearchBox({
    value = '',
    placeholder = 'Search...',
    caret = false,
    target,
}: {
    value?: string;
    placeholder?: string;
    caret?: boolean;
    target?: string;
}) {
    return (
        <div className={cx('ap-search', caret && 'has-focus')} data-pt-target={target}>
            <AppIcon name="search" />
            <span className={!value ? 'is-placeholder' : undefined}>
                {value || placeholder}
                {caret && <span className="pt-caret" />}
            </span>
            {value && <AppIcon name="close" size={9} />}
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="ap-empty">
            <img src={emptyState} alt="" />
            <span>{label}</span>
        </div>
    );
}

function Footer({ overlay = false }: { overlay?: boolean }) {
    return (
        <footer className="ap-footer">
            <span>
                <AppIcon name="copy" size={9} />
                {overlay ? 'Access Token' : PREVIEW_ORG.username}
                <i />
                <AppIcon name="copy" size={9} />
                {overlay ? PREVIEW_ORG.username : 'Access Token'}
            </span>
            <span>
                {overlay ? (
                    <>
                        Overlay: <kbd>Ctrl+Shift+E</kbd> · Panel: <kbd>Ctrl+Shift+Space</kbd>
                    </>
                ) : (
                    <>
                        {PREVIEW_VERSION} / API {PREVIEW_ORG.api}
                    </>
                )}
            </span>
        </footer>
    );
}

function Navigation({ active }: { active: TourSlideId }) {
    const go = useTourNav();
    const appId = active === 'workbench' ? 'metadata' : active;
    return (
        <aside className="ap-navigation">
            <div className="ap-nav-scroll">
                <section>
                    <h3>Build</h3>
                    <div className="ap-nav-row">
                        <AppIcon name="home" />
                        Home
                    </div>
                    {PREVIEW_MENU_GROUPS.map(group => {
                        const expanded = group.apps.some(app => app.id === appId);
                        return (
                            <div key={group.id}>
                                <div className="ap-nav-row">
                                    <AppIcon name={group.icon} />
                                    {group.label}
                                    <AppIcon
                                        name={expanded ? 'chevrondown' : 'chevronright'}
                                        size={9}
                                    />
                                </div>
                                {expanded &&
                                    group.apps.map(app => (
                                        <button
                                            type="button"
                                            key={app.id}
                                            className={cx(
                                                'ap-nav-child',
                                                app.id === appId && 'is-selected'
                                            )}
                                            onClick={() => {
                                                if (app.id === 'soql') go?.('soql');
                                                if (app.id === 'metadata') go?.('workbench');
                                            }}
                                        >
                                            {app.label}
                                        </button>
                                    ))}
                            </div>
                        );
                    })}
                </section>
                <section>
                    <h3>Connections</h3>
                    <div className="ap-nav-row">
                        <AppIcon name="world" />
                        Connections
                    </div>
                </section>
                <section>
                    <h3>Documentation</h3>
                    <div className="ap-nav-row">
                        <AppIcon name="list" />
                        Documentation
                    </div>
                </section>
                <section>
                    <h3>Others</h3>
                    <button className="ap-nav-row" type="button" onClick={() => go?.('editor')}>
                        <SquareTerminal size={12} />
                        VS Code Editor
                        <AppIcon name="new_window" size={9} />
                    </button>
                    {['Settings', 'Release Notes', 'How to', 'Report issue', 'Contribute'].map(
                        (label, i) => (
                            <div key={label} className="ap-nav-row">
                                <AppIcon name={['settings', 'list', 'info', 'bug', 'user'][i]} />
                                {label}
                                {i > 1 && <AppIcon name="new_window" size={9} />}
                            </div>
                        )
                    )}
                </section>
            </div>
            <div className="ap-nav-collapse">
                <AppIcon name="toggle_panel_left" />
                Collapse Navigation
            </div>
        </aside>
    );
}

function WorkbenchShell({
    active,
    children,
}: {
    active: 'soql' | 'workbench';
    children: ReactNode;
}) {
    return (
        <div className="ap-workbench">
            <div className="ap-session">
                <AppIcon name="user" size={9} />
                Logged in as {PREVIEW_ORG.user} (Acme — DEV) | {PREVIEW_ORG.username}.{' '}
                <u>Log out</u>
            </div>
            <header className="ap-context">
                <AppIcon name="toggle_panel_left" size={15} />
                <span>Workbench</span>
                <span className="ap-beta">Beta</span>
                <span className="ap-context-tab">Org. Overview</span>
                <span className="ap-context-tab is-active">
                    {active === 'soql' ? 'SOQL Explorer' : 'Metadata Explorer'}
                    <AppIcon name="close" size={9} />
                </span>
                <AppIcon name="einstein" size={17} />
            </header>
            <div className="ap-workbench-body">
                <Navigation active={active} />
                <main className="ap-workbench-main">{children}</main>
            </div>
            <Footer />
        </div>
    );
}

function BuilderHeader({ metadata = false, play }: { metadata?: boolean; play: SlidePlay }) {
    return (
        <header className="ap-builder-header">
            <div className="ap-builder-title">
                <span className={cx('ap-standard-icon', metadata && 'is-metadata')}>
                    <AppIcon name={metadata ? 'bundle_config' : 'dataset'} standard size={23} />
                </span>
                <div>
                    <small>{metadata ? 'Explorer' : 'Tools'}</small>
                    <strong>{metadata ? 'Metadata Explorer' : 'SOQL Explorer'}</strong>
                </div>
            </div>
            <div className="ap-builder-actions">
                {metadata ? (
                    <>
                        <button>Sync metadata</button>
                        <button disabled>Cancel sync</button>
                    </>
                ) : (
                    <>
                        <SearchBox placeholder="Search table..." />
                        <button>Save</button>
                        <button
                            className={cx('ap-brand-button', play.sendPulse && 'is-running')}
                            data-pt-target="run"
                        >
                            <AppIcon name="forward" size={9} />
                            {play.sendPulse ? 'Running...' : 'Run'}
                        </button>
                    </>
                )}
            </div>
            {metadata ? (
                <div className="ap-quick-links">
                    <span>QUICK LINKS</span>
                    <div>
                        {['Apex', 'LWC', 'Aura', 'Flow', 'WorkFlow'].map(label => (
                            <button key={label}>{label}</button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="ap-builder-subrow">
                    <span>{play.resultsVisible ? '3 records · Query completed' : ''}</span>
                    <div>
                        {[
                            'delete',
                            'download',
                            'copy',
                            'refresh',
                            'toggle_panel_left',
                            'table',
                        ].map((icon, i) => (
                            <IconButton
                                key={icon}
                                icon={icon}
                                label={
                                    [
                                        'Delete',
                                        'Download',
                                        'Copy',
                                        'Refresh',
                                        'Objects panel',
                                        'Table',
                                    ][i]
                                }
                                active={i === 4}
                            />
                        ))}
                    </div>
                </div>
            )}
        </header>
    );
}

function CodeLines({
    text,
    caret = false,
    html = false,
}: {
    text: string;
    caret?: boolean;
    html?: boolean;
}) {
    const lines = text.split('\n');
    return (
        <div className={cx('ap-code', html && 'is-html')}>
            {lines.map((line, index) => (
                <div className="ap-code-line" key={index}>
                    <span>{index + 1}</span>
                    <code>
                        {line
                            .split(
                                /(SELECT|FROM|LIMIT|WHERE|<\/?[\w-]+|\bclass\b|\btitle\b|\{name\}|\{industry\}|"[^"]*")/g
                            )
                            .map((part, p) => (
                                <span
                                    key={p}
                                    className={
                                        /^(SELECT|FROM|LIMIT|WHERE|<\/?[\w-]+)$/.test(part)
                                            ? 'ap-syntax-keyword'
                                            : /^(class|title)$/.test(part)
                                              ? 'ap-syntax-attribute'
                                              : /^"|^\{/.test(part)
                                                ? 'ap-syntax-value'
                                                : undefined
                                    }
                                >
                                    {part}
                                </span>
                            ))}
                        {caret && index === lines.length - 1 && <span className="pt-caret" />}
                    </code>
                </div>
            ))}
        </div>
    );
}

function SoqlPreview({ play }: { play: SlidePlay }) {
    const queryHasObject = play.soqlDraft.includes('FROM Account');
    return (
        <WorkbenchShell active="soql">
            <BuilderHeader play={play} />
            <div className="ap-query-layout">
                <aside className="ap-object-panel">
                    <h3>
                        SObjects
                        <AppIcon name="refresh" size={10} />
                    </h3>
                    <SearchBox />
                    <div className="ap-object-list">
                        {PREVIEW_OBJECTS.map(name => (
                            <div
                                key={name}
                                className={
                                    queryHasObject && name === 'Account' ? 'is-selected' : undefined
                                }
                            >
                                <AppIcon name="database" size={10} />
                                <span>
                                    {name} <em>/ {name.replace(/([a-z])([A-Z])/g, '$1 $2')}</em>
                                </span>
                            </div>
                        ))}
                    </div>
                </aside>
                <div className="ap-query-workspace">
                    <div className="ap-query-editor">
                        <div className="ap-scoped-tabs">
                            <span className="is-active">Query 1</span>
                            <span>+</span>
                        </div>
                        <div data-pt-target="soql" className="ap-query-code">
                            <CodeLines text={play.soqlDraft} caret={play.soqlCaret} />
                            {play.soqlCaret &&
                                play.soqlDraft.length > 10 &&
                                play.soqlDraft.length < 28 && (
                                    <div className="ap-autocomplete">
                                        <div>
                                            <AppIcon name="database" size={10} />
                                            {play.soqlDraft.length < 20 ? 'Industry' : 'Account'}
                                            <span>Salesforce</span>
                                        </div>
                                        <p>AccountChangeEvent</p>
                                        <p>AccountContactRelation</p>
                                    </div>
                                )}
                        </div>
                        <div className="ap-query-options">
                            Include Deleted Records <span className="ap-toggle" />
                        </div>
                    </div>
                    <div className="ap-splitter">
                        <span />
                        <span />
                        <span />
                    </div>
                    <div className="ap-query-results">
                        {play.resultsVisible ? (
                            <table className="ap-results-table">
                                <thead>
                                    <tr>
                                        <th>□</th>
                                        <th>#</th>
                                        {['Id', 'Name', 'Industry'].map(name => (
                                            <th key={name}>
                                                {name}
                                                <AppIcon name="chevrondown" size={7} />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {PREVIEW_ACCOUNTS.map((record, index) => (
                                        <tr key={record[0]}>
                                            <td>□</td>
                                            <td>{index + 1}</td>
                                            {record.map((value, i) => (
                                                <td
                                                    key={value}
                                                    className={i === 0 ? 'ap-record-id' : undefined}
                                                >
                                                    {value}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <EmptyState label="Click Run or use CMD/CTRL + Enter to execute a query" />
                        )}
                    </div>
                </div>
            </div>
        </WorkbenchShell>
    );
}

function MetadataPreview({ play }: { play: SlidePlay }) {
    const open = Boolean(play.metaFilter);
    return (
        <WorkbenchShell active="workbench">
            <BuilderHeader metadata play={play} />
            <div className="ap-metadata-layout">
                <aside className="ap-metadata-menu">
                    <div className="ap-types-panel">
                        <h3>
                            Metadata Types
                            <AppIcon name="refresh" size={10} />
                        </h3>
                        <SearchBox />
                        <div className="ap-type-list">
                            {(open
                                ? [
                                      'ApexClass',
                                      'ApexComponent',
                                      'ApexPage',
                                      'CustomObject',
                                      'CustomPermission',
                                      'Flow',
                                      'Layout',
                                      'LightningComponentBundle',
                                      'PermissionSet',
                                      'Profile',
                                  ]
                                : PREVIEW_METADATA_TYPES
                            ).map(name => (
                                <div
                                    key={name}
                                    className={
                                        name === 'CustomObject' && open ? 'is-selected' : undefined
                                    }
                                >
                                    <AppIcon name="settings" size={10} />
                                    {name}
                                </div>
                            ))}
                        </div>
                    </div>
                    {open && (
                        <div className="ap-records-panel">
                            <h3>
                                <AppIcon name="back" size={10} />
                                CustomObject (24)
                            </h3>
                            <SearchBox
                                value={play.metaFilter}
                                caret={play.metaCaret}
                                target="meta-filter"
                            />
                            <div className="ap-type-list">
                                {['Account', 'AccountContactRole', 'AccountPartner', 'AccountShare']
                                    .filter(name =>
                                        name.toLowerCase().includes(play.metaFilter.toLowerCase())
                                    )
                                    .map(name => (
                                        <div
                                            key={name}
                                            className={
                                                name === 'Account' && play.metaSelected
                                                    ? 'is-selected'
                                                    : undefined
                                            }
                                        >
                                            <Files size={10} />
                                            {name}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                    {!open && <div data-pt-target="meta-filter" />}
                </aside>
                <div className="ap-metadata-detail">
                    {play.metaSelected ? (
                        <>
                            <div className="ap-scoped-tabs">
                                <span className="is-active">
                                    Account <AppIcon name="close" size={8} />
                                </span>
                            </div>
                            <div className="ap-scoped-tabs ap-viewer-tabs">
                                <span className="is-active">Workbench</span>
                                <span>JSON</span>
                            </div>
                            <div className="ap-metadata-tree">
                                <p>
                                    Expand All <span>|</span> Collapse All
                                </p>
                                {(
                                    [
                                        ['fullName', 'Account'],
                                        ['label', 'Account'],
                                        ['pluralLabel', 'Accounts'],
                                        ['deploymentStatus', 'Deployed'],
                                        ['sharingModel', 'ReadWrite'],
                                        ['enableActivities', 'true'],
                                        ['enableReports', 'true'],
                                        ['fields', '(186)'],
                                        ['nameField', '(2)'],
                                        ['recordTypes', '(2)'],
                                    ] as const
                                ).map(([key, value]) => (
                                    <div key={key}>
                                        <AppIcon
                                            name={
                                                value.startsWith('(')
                                                    ? 'chevronright'
                                                    : 'chevrondown'
                                            }
                                            size={8}
                                        />
                                        <span>{key}</span>
                                        <strong
                                            className={value === 'true' ? 'is-true' : undefined}
                                        >
                                            {value}
                                        </strong>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <EmptyState label="Select a metadata component to explore" />
                    )}
                </div>
            </div>
        </WorkbenchShell>
    );
}

function SalesforcePage({ children }: { children?: ReactNode }) {
    return (
        <div className="ap-salesforce">
            <div className="ap-sf-environment">
                <Menu size={11} />
                <span>
                    <Code2 size={11} />
                    Developer Edition
                </span>
                <AppIcon name="chevrondown" size={10} />
            </div>
            <header className="ap-sf-header">
                <span className="ap-sf-cloud">
                    <svg viewBox="0 0 64 44" aria-hidden="true">
                        <path
                            fill="#00a1e0"
                            d="M26 7A15 15 0 0 0 3 22a12 12 0 0 0 12 15 15 15 0 0 0 24 1 12 12 0 0 0 9-1A16 16 0 1 0 45 6a12 12 0 0 0-19 1Z"
                        />
                    </svg>
                </span>
                <SearchBox placeholder="Search..." />
                <span className="ap-sf-tools">
                    ＋&emsp;◉&emsp;?&emsp;⚙&emsp;♟<span>AR</span>
                </span>
            </header>
            <nav className="ap-sf-navigation">
                <LayoutGrid size={16} />
                <strong>Sales</strong>
                {[
                    'Home',
                    'Opportunities',
                    'Leads',
                    'Tasks',
                    'Files',
                    'Accounts',
                    'Contacts',
                    'Campaigns',
                    'Dashboards',
                    'Reports',
                ].map((label, index) => (
                    <span key={label} className={index === 5 ? 'is-active' : undefined}>
                        {label}
                        {index > 0 && <AppIcon name="chevrondown" size={7} />}
                    </span>
                ))}
            </nav>
            <main className="ap-sf-record">
                <div className="ap-record-heading">
                    <span className="ap-account-icon">
                        <AppIcon name="account" standard size={24} />
                    </span>
                    <div>
                        <small>Account</small>
                        <h2>Acme Corp</h2>
                    </div>
                    <div className="ap-record-actions">
                        <button>Follow</button>
                        <button>Edit</button>
                        <button>Delete</button>
                        <button>Clone</button>
                        <button>New Contact</button>
                        <button>New Case</button>
                    </div>
                </div>
                <div className="ap-record-highlights">
                    {[
                        ['Account Owner', 'Alex Rivera'],
                        ['Industry', 'Technology'],
                        ['Phone', '(415) 555-0142'],
                        ['Website', 'www.acme.example'],
                        ['Type', 'Customer'],
                    ].map(([label, value]) => (
                        <div key={label}>
                            <small>{label}</small>
                            <span>{value}</span>
                        </div>
                    ))}
                </div>
                <div className="ap-sf-columns">
                    <section>
                        <div className="ap-sf-record-tabs">
                            <span>Related</span>
                            <span className="is-active">Details</span>
                        </div>
                        <div className="ap-detail-heading">
                            <AppIcon name="chevrondown" size={10} />
                            Account Information
                        </div>
                        <div className="ap-record-fields">
                            {[
                                ['Account Name', 'Acme Corp'],
                                ['Account Owner', 'Alex Rivera'],
                                ['Account Number', 'AC-1042'],
                                ['Type', 'Customer'],
                                ['Industry', 'Technology'],
                                ['Annual Revenue', '$ 12,000,000'],
                                ['Phone', '(415) 555-0142'],
                                ['Employees', '85'],
                                ['Website', 'www.acme.example'],
                                ['Rating', 'Warm'],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <small>{label}</small>
                                    <span>
                                        {value}
                                        <AppIcon name="edit" size={9} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <aside>
                        <div className="ap-sf-record-tabs">
                            <span className="is-active">Activity</span>
                            <span>Chatter</span>
                        </div>
                        <div className="ap-activity-actions">
                            New Task&emsp;&emsp;New Event&emsp;&emsp;Email
                        </div>
                        <h4>Upcoming & Overdue</h4>
                        <p>No activities to show.</p>
                        <img src={emptyState} alt="" />
                        <p>Keep your activities up to date.</p>
                    </aside>
                </div>
            </main>
            <div className="ap-sf-utility">
                <AppIcon name="list" size={10} />
                To Do List
            </div>
            {children}
        </div>
    );
}

function OverlayPreview({ play }: { play: SlidePlay }) {
    const go = useTourNav();
    const searching = Boolean(play.overlaySearch);
    return (
        <SalesforcePage>
            <div className="ap-overlay-dock">
                <IconButton icon="toggle_panel_right" label="Open side panel" />
                <IconButton
                    icon="search"
                    label="Search objects"
                    active={play.overlayOpen}
                    target="overlay-toggle"
                />
                <IconButton icon="edit" label="Edit record" />
            </div>
            <div className={cx('ap-overlay', play.overlayOpen && 'is-open')}>
                <div className="ap-overlay-header">
                    <IconButton icon="filterList" label="Filters" />
                    <SearchBox
                        value={play.overlaySearch}
                        caret={play.overlayCaret}
                        placeholder="Search Object, Profiles and more"
                        target="overlay-search"
                    />
                    <div className="ap-button-group">
                        <button
                            className={cx('ap-icon-button', play.vscodeHot && 'is-active')}
                            aria-label="Open VS Code Editor"
                            data-pt-target="dock-vscode"
                            onClick={() => go?.('editor')}
                        >
                            <SquareTerminal size={13} />
                        </button>
                        <IconButton
                            icon="database"
                            label="Open SOQL Explorer"
                            onClick={() => go?.('soql')}
                        />
                        <IconButton
                            icon="new_window"
                            label="Open Workbench"
                            onClick={() => go?.('workbench')}
                        />
                        <IconButton icon="share" label="Share" />
                    </div>
                </div>
                <div className="ap-overlay-refresh">
                    {searching ? '4 objects · ' : ''}Org info refreshed a few seconds ago
                    <AppIcon name="refresh" size={10} />
                </div>
                <div className="ap-overlay-tabs">
                    {['Organization', 'Quick Links (303)', 'Object (1085)', 'Users (24)'].map(
                        (label, i) => (
                            <span
                                key={label}
                                className={
                                    (searching ? i === 2 : i === 0) ? 'is-active' : undefined
                                }
                            >
                                {label}
                            </span>
                        )
                    )}
                </div>
                <div className="ap-overlay-content">
                    {searching ? (
                        <>
                            <div className="ap-overlay-filters">
                                <span className="is-active">All</span>
                                <span>Recent</span>
                                <span>Custom</span>
                                <span>Standard</span>
                                <strong>Setup</strong>
                            </div>
                            {['Account', 'Account Contact Role', 'Account Partner', 'Account Share']
                                .filter(name =>
                                    name.toLowerCase().includes(play.overlaySearch.toLowerCase())
                                )
                                .map((label, i) => (
                                    <div className="ap-overlay-object" key={label}>
                                        <span className="ap-account-icon">
                                            <AppIcon name="account" standard size={19} />
                                        </span>
                                        <div>
                                            <strong>{label}</strong>
                                            <small>{label.replaceAll(' ', '')}</small>
                                        </div>
                                        <div className="ap-object-actions">
                                            <span>
                                                <AppIcon name="search" />
                                                <AppIcon name="setup" />
                                                <AppIcon name="info" />
                                                <AppIcon name="new_window" />
                                            </span>
                                            <span>
                                                <i>Q</i>
                                                <i>C</i>
                                                <i>U</i>
                                            </span>
                                        </div>
                                        {i === 0 && <span className="ap-object-selected" />}
                                    </div>
                                ))}
                        </>
                    ) : (
                        <>
                            {[
                                [
                                    'ORGANIZATION',
                                    [
                                        ['Org Name', PREVIEW_ORG.name],
                                        ['Org Id', '00Dxx0000000001'],
                                        ['Instance URL', `https://${PREVIEW_ORG.host}`],
                                        ['Sandbox', 'No'],
                                        ['Org Type', 'Developer Edition'],
                                        ['API Version', PREVIEW_ORG.api],
                                    ],
                                ],
                                [
                                    'USER',
                                    [
                                        ['User Name', PREVIEW_ORG.user],
                                        ['User Id', '005xx0000000001'],
                                        ['Username', PREVIEW_ORG.username],
                                        ['Email', 'alex@acme.example'],
                                    ],
                                ],
                            ].map(([label, rows]) => (
                                <fieldset key={String(label)}>
                                    <legend>{String(label)}</legend>
                                    {(rows as string[][]).map(([key, value]) => (
                                        <div key={key}>
                                            <span>{key}:</span>
                                            <strong>{value}</strong>
                                        </div>
                                    ))}
                                </fieldset>
                            ))}
                        </>
                    )}
                </div>
                <Footer overlay />
            </div>
        </SalesforcePage>
    );
}

function EditorPreview({ play }: { play: SlidePlay }) {
    return (
        <div className="ap-vscode">
            <header className="ap-vscode-host">
                <strong>Welcome to {PREVIEW_ORG.username}.</strong>
                <span className="ap-beta">Beta</span>
                <span>{PREVIEW_ORG.host}</span>
                <b>Trailhead org</b>
                <AppIcon name="download" />
                <Settings size={14} />
            </header>
            <div className="ap-vscode-welcome">
                <Code2 size={14} />
                Welcome to Salesforce Workbench
                <AppIcon name="close" size={11} />
            </div>
            <div className="ap-vscode-commandbar">
                <Menu size={12} />
                <AppIcon name="back" />
                <AppIcon name="forward" />
                <div>
                    Salesforce Workbench —{' '}
                    {play.bundleReady ? 'accountHighlight.html' : 'Workspace'}
                </div>
                <LayoutGrid size={13} />
                <AppIcon name="toggle_panel_right" />
            </div>
            <div className="ap-vscode-workspace">
                <aside className="ap-vscode-rail">
                    <Files />
                    <GitBranch />
                    <AppIcon name="search" size={18} />
                    <LayoutGrid />
                    <Play />
                    <AppIcon name="world" size={18} />
                    <SquareTerminal />
                    <Settings />
                </aside>
                <aside className="ap-vscode-explorer">
                    <h3>
                        EXPLORER <span>···</span>
                    </h3>
                    <strong>
                        <AppIcon name="chevrondown" size={9} />
                        SALESFORCE WORKBENCH
                    </strong>
                    <div className="ap-vscode-tree">
                        <p>
                            <AppIcon name="chevrondown" size={9} />
                            force-app
                        </p>
                        <p>
                            &emsp;
                            <AppIcon name="chevrondown" size={9} />
                            main
                        </p>
                        <p>
                            &emsp;&emsp;
                            <AppIcon name="chevrondown" size={9} />
                            default
                        </p>
                        <p>
                            &emsp;&emsp; <AppIcon name="chevronright" size={9} />
                            classes
                        </p>
                        <p>
                            &emsp;&emsp; <AppIcon name="chevrondown" size={9} />
                            lwc
                        </p>
                        {play.bundleReady && (
                            <>
                                <p className="ap-tree-bundle">⌄ accountHighlight</p>
                                <p className="ap-tree-file is-selected">◇ accountHighlight.html</p>
                                <p className="ap-tree-file">JS accountHighlight.js</p>
                                <p className="ap-tree-file">◇ accountHighlight.js-meta.xml</p>
                            </>
                        )}
                        <p>
                            &emsp;&emsp; <AppIcon name="chevronright" size={9} />
                            objects
                        </p>
                        <p>⌄ manifest</p>
                        <p>&emsp;◇ package.xml</p>
                        <p>◈ sfdx-project.json</p>
                    </div>
                    <div className="ap-vscode-outline">⌃ OUTLINE</div>
                </aside>
                <main className="ap-vscode-main">
                    <div className="ap-vscode-tabs">
                        <span>
                            {play.bundleReady ? '◇ accountHighlight.html' : 'Welcome'}{' '}
                            {play.editorDirty ? '●' : '×'}
                        </span>
                    </div>
                    <div className="ap-vscode-breadcrumb">
                        force-app › main › default › lwc{' '}
                        {play.bundleReady && '› accountHighlight › accountHighlight.html'}
                    </div>
                    <div className="ap-vscode-code" data-pt-target="editor">
                        <CodeLines text={play.editorTyped} caret={play.editorCaret} html />
                        <div className="ap-minimap">
                            {Array.from({ length: 18 }, (_, i) => (
                                <i key={i} style={{ width: `${18 + ((i * 7) % 36)}px` }} />
                            ))}
                        </div>
                    </div>
                    <div className="ap-vscode-panel-tabs">
                        <span>PROBLEMS</span>
                        <span className="is-active">SALESFORCE</span>
                        <span>OUTPUT</span>
                        <span>TERMINAL</span>
                        <span>···&emsp;×</span>
                    </div>
                    <div className="ap-salesforce-panel">
                        <div>
                            <h4>SALESFORCE</h4>
                            <div className="ap-connection-card">
                                <div>
                                    <strong>Salesforce connected</strong>
                                    <small>{PREVIEW_ORG.host}</small>
                                    <button>Sync Project</button>
                                </div>
                                <div>
                                    <span>API version</span>
                                    <b>{PREVIEW_ORG.api}&emsp;⌄</b>
                                    <button>Apply</button>
                                </div>
                                <p>
                                    DEPLOY OPTIONS&emsp;{' '}
                                    <span>
                                        ☑ Auto-deploy on save&emsp; ☑ Prefer Tooling API&emsp; ☑
                                        Notify on success
                                    </span>
                                </p>
                            </div>
                        </div>
                        <aside>
                            <h4>SCHEMA</h4>
                            {PREVIEW_OBJECTS.slice(0, 8).map(name => (
                                <p key={name}>
                                    <AppIcon name="chevronright" size={8} />
                                    <AppIcon name="database" size={10} />
                                    {name}
                                </p>
                            ))}
                        </aside>
                    </div>
                </main>
            </div>
            <footer className="ap-vscode-status">
                <span>⌁ Salesforce Workbench</span>
                <span>☁ SF: {PREVIEW_ORG.username} · Connected</span>
                <span>AutoDeploy: On</span>
                <span>ⓧ 0&emsp;⚠ 0</span>
                <span>
                    Ln {play.editorTyped.split('\n').length}, Col 1&emsp; Spaces: 2&emsp;
                    UTF-8&emsp; HTML
                </span>
            </footer>
            {play.paletteOpen && (
                <div className="ap-vscode-palette" data-pt-target="palette">
                    <div>
                        {play.palettePhase === 'name'
                            ? play.paletteName || 'Component name'
                            : `>${play.paletteQuery}`}
                        <span className="pt-caret" />
                    </div>
                    {play.palettePhase === 'name' ? (
                        <p>
                            Enter a name for the new Lightning web component. Press Enter to
                            confirm.
                        </p>
                    ) : (
                        <>
                            <p className="is-active">
                                SFDX: Create Lightning Web Component <span>recently used</span>
                            </p>
                            <p>SFDX: Create Apex Class</p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function AgentPreview({ play }: { play: SlidePlay }) {
    const threadRef = useRef<HTMLDivElement>(null);
    const sent = play.formFocus === 'submit';
    const tools = [
        'Read the page',
        'Fill name',
        'Fill email',
        'Fill order number',
        'Fill message',
        'Submit support form',
    ];
    const activeTool =
        play.formFocus === null
            ? 0
            : ['name', 'email', 'order', 'message', 'submit'].indexOf(play.formFocus) + 1;
    useLayoutEffect(() => {
        const thread = threadRef.current;
        if (thread) thread.scrollTop = thread.scrollHeight;
    }, [activeTool, sent]);
    return (
        <div className="ap-agent-scene">
            <div className="ap-support-site">
                <header>
                    <span className="ap-acme-logo">A</span>
                    <strong>Acme</strong>
                    <nav>
                        Help Center&emsp; <b>Contact</b>&emsp; Status
                    </nav>
                </header>
                <div className="ap-support-main">
                    <div className="ap-support-card">
                        <small>SUPPORT</small>
                        <h2>Contact support</h2>
                        <p>Tell us about the issue and we will get back to you.</p>
                        <div className="ap-support-fields">
                            {(
                                [
                                    ['Name', play.formName, 'name', 'Full name'],
                                    ['Email', play.formEmail, 'email', 'you@company.com'],
                                    ['Order number', play.formOrder, 'order', 'e.g. 1842'],
                                    ['Message', play.formMessage, 'message', 'Describe the issue'],
                                ] as const
                            ).map(([label, value, target, placeholder]) => (
                                <div
                                    key={target}
                                    className={cx(
                                        'ap-form-field',
                                        (target === 'order' || target === 'message') && 'is-wide',
                                        target === 'message' && 'is-message'
                                    )}
                                >
                                    <label>{label}</label>
                                    <div
                                        className={cx(
                                            play.formFocus === target && 'has-focus',
                                            !value && 'is-placeholder'
                                        )}
                                        data-pt-target={`form-${target}`}
                                    >
                                        {value || placeholder}
                                        {play.formFocus === target && <span className="pt-caret" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <span
                            className={cx('ap-support-submit', sent && 'is-sent')}
                            data-pt-target="form-submit"
                        >
                            {sent ? '✓ Sent' : 'Submit ticket'}
                        </span>
                    </div>
                </div>
            </div>
            <aside className="ap-agent-panel">
                <div className="ap-chrome-panel-heading">
                    <img className="ap-extension-logo" src={extensionIcon} alt="" />
                    Workbench
                    <AppIcon name="close" size={10} />
                </div>
                <div className="ap-agent-search">
                    <IconButton icon="world" label="Browser context" />
                    <SearchBox />
                    <div className="ap-button-group">
                        <IconButton icon="einstein" label="Agent" active />
                        <IconButton icon="copy" label="Records" />
                        <IconButton icon="world" label="Connections" />
                        <IconButton icon="table" label="Tools" />
                        <IconButton icon="chevrondown" label="More tools" />
                    </div>
                </div>
                <div className="ap-agent-toolbar">
                    <IconButton icon="side_list" label="Conversations" />
                    <IconButton icon="add" label="New conversation" />
                    <IconButton icon="bug" label="Debug" />
                    <strong>Acme support request</strong>
                </div>
                <div className="ap-agent-thread" ref={threadRef}>
                    <div className="ap-user-message">
                        Fill and submit this support form for Alex Rivera, order 1842.
                    </div>
                    <div className="ap-reasoning">
                        ◌ Thought briefly <AppIcon name="chevronright" size={8} />
                    </div>
                    <p>I’ll fill in the details and submit the support request.</p>
                    <div className="ap-agent-tool-list">
                        {tools.slice(0, activeTool + 1).map((label, index) => (
                            <div
                                key={label}
                                className={index < activeTool || sent ? 'is-complete' : ''}
                            >
                                <AppIcon
                                    name={index < activeTool || sent ? 'check' : 'refresh'}
                                    size={9}
                                />
                                <em>{label}</em>
                                <AppIcon name="chevronright" size={8} />
                            </div>
                        ))}
                    </div>
                    {sent && (
                        <div className="ap-agent-answer">
                            Submitted the support form for order 1842.
                            <div>
                                <AppIcon name="copy" size={11} />
                                <AppIcon name="refresh" size={11} />
                            </div>
                        </div>
                    )}
                </div>
                <div className="ap-agent-composer">
                    <div>
                        <span>
                            gpt-5-mini
                            <AppIcon name="chevrondown" size={9} />
                        </span>
                        <span>◉⌄</span>
                    </div>
                    <p>Write a prompt...</p>
                    <footer>
                        <IconButton icon="attach" label="Attach" />
                        <IconButton icon="settings" label="Settings" />
                        <IconButton icon={sent ? 'send' : 'stop'} label={sent ? 'Send' : 'Stop'} />
                    </footer>
                </div>
            </aside>
        </div>
    );
}

export function AppPreview({
    slideId,
    play,
}: {
    slideId: TourSlideId;
    play: SlidePlay;
}): ReactNode {
    if (slideId === 'overlay') return <OverlayPreview play={play} />;
    if (slideId === 'soql') return <SoqlPreview play={play} />;
    if (slideId === 'workbench') return <MetadataPreview play={play} />;
    if (slideId === 'editor') return <EditorPreview play={play} />;
    return <AgentPreview play={play} />;
}
