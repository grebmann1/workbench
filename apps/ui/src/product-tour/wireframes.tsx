import type { ReactNode } from 'react';
import {
    Bell,
    Bot,
    Building2,
    ChevronDown,
    ChevronRight,
    Cloud,
    Code2,
    Copy,
    Database,
    FileCode2,
    Filter,
    Folder,
    Globe,
    LayoutGrid,
    MousePointerClick,
    Package,
    PanelRight,
    Pencil,
    Play,
    RefreshCw,
    Search,
    Send,
    Settings,
    Share2,
    SquareTerminal,
    Table2,
} from 'lucide-react';
import type { FlowScene, FormFocus, PalettePhase } from './flow-scene';
import { AUTHORED_HEIGHT, AUTHORED_WIDTH, type TourSlideId } from './slides';
import { completedSlidePlay, type SlidePlay } from './slide-scene';
import { useTourNav } from './tour-nav';

function classNames(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

function Caret(): ReactNode {
    return <span className="pt-caret" aria-hidden />;
}

function SalesforceHeader(): ReactNode {
    return (
        <header className="pt-lex-header">
            <span className="pt-lex-launcher" aria-hidden>
                <LayoutGrid size={14} strokeWidth={1.75} />
            </span>
            <span className="pt-lex-cloud" aria-hidden>
                <Cloud size={16} strokeWidth={1.75} />
            </span>
            <span className="pt-lex-app">Sales</span>
            <span className="pt-lex-search">
                <Search size={11} strokeWidth={2} aria-hidden />
                Search Salesforce
            </span>
            <span className="pt-lex-header-end">
                <Bell size={13} strokeWidth={1.75} aria-hidden />
                <span className="pt-avatar" aria-hidden>
                    A
                </span>
            </span>
        </header>
    );
}

function SalesforceNav({ onAccounts }: { onAccounts?: () => void }): ReactNode {
    return (
        <nav className="pt-lex-nav" aria-label="Salesforce apps">
            <span>Home</span>
            <button type="button" className="is-active" onClick={onAccounts}>
                Accounts
            </button>
            <span>Contacts</span>
            <span>Opportunities</span>
            <span>Reports</span>
        </nav>
    );
}

function OverlayDock({
    overlayOpen,
    soqlHot,
    vscodeHot,
    onOpenSoql,
    onOpenEditor,
}: {
    overlayOpen: boolean;
    soqlHot?: boolean;
    vscodeHot?: boolean;
    onOpenSoql?: () => void;
    onOpenEditor?: () => void;
}): ReactNode {
    return (
        <div className={classNames('pt-overlay-dock', overlayOpen && 'is-open')} aria-hidden>
            <span>
                <PanelRight size={12} strokeWidth={2} />
            </span>
            <span className="is-active">
                <Search size={12} strokeWidth={2} />
            </span>
            <span>
                <Pencil size={12} strokeWidth={2} />
            </span>
            <button
                type="button"
                className={classNames('pt-overlay-soql', vscodeHot && 'is-hot')}
                onClick={onOpenEditor}
                aria-label="Open VS Code Editor"
            >
                <SquareTerminal size={12} strokeWidth={2} />
            </button>
            <button
                type="button"
                className={classNames('pt-overlay-soql', soqlHot && 'is-hot')}
                onClick={onOpenSoql}
                aria-label="Open SOQL Explorer"
            >
                <Database size={12} strokeWidth={2} />
            </button>
        </div>
    );
}

function OverlayPanel({
    search,
    caret,
    soqlHot,
    vscodeHot,
    onOpenSoql,
    onOpenEditor,
}: {
    search: string;
    caret: boolean;
    soqlHot?: boolean;
    vscodeHot?: boolean;
    onOpenSoql?: () => void;
    onOpenEditor?: () => void;
}): ReactNode {
    const q = search.toLowerCase();
    const objects = ['Account', 'Contact', 'Opportunity', 'Lead', 'User'].filter(
        name => !q || name.toLowerCase().includes(q)
    );
    return (
        <aside className="pt-overlay" aria-label="Workbench overlay">
            <div className="pt-overlay-bar">
                <span className="pt-overlay-search">
                    <Filter size={11} strokeWidth={2} aria-hidden />
                    <span className="pt-overlay-search-value">
                        {search || 'Search Object, Profiles and more'}
                        {caret ? <Caret /> : null}
                    </span>
                </span>
                <span className="pt-overlay-actions">
                    <button
                        type="button"
                        className={classNames('pt-overlay-soql', vscodeHot && 'is-hot')}
                        onClick={onOpenEditor}
                        aria-label="Open VS Code Editor"
                    >
                        <SquareTerminal size={12} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        className={classNames('pt-overlay-soql', soqlHot && 'is-hot')}
                        onClick={onOpenSoql}
                        aria-label="Open SOQL Explorer"
                    >
                        <Database size={12} strokeWidth={2} />
                    </button>
                    <Share2 size={12} strokeWidth={2} aria-hidden />
                </span>
            </div>
            <div className="pt-overlay-meta">
                48 objects • Refreshed just now
                <RefreshCw size={11} strokeWidth={2} aria-hidden />
            </div>
            {search ? (
                <ul className="pt-overlay-list">
                    {objects.map(name => (
                        <li key={name} className={name === 'Account' ? 'is-hot' : undefined}>
                            <Building2 size={12} strokeWidth={2} aria-hidden />
                            {name}
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="pt-overlay-cards">
                    <fieldset className="pt-info-card">
                        <legend>ORGANIZATION</legend>
                        <div>
                            <span>Name</span>
                            <strong>
                                Acme
                                <Copy size={10} strokeWidth={2} aria-hidden />
                            </strong>
                        </div>
                        <div>
                            <span>Instance</span>
                            <strong>NA123</strong>
                        </div>
                        <div>
                            <span>Org Id</span>
                            <strong>00Dxx0000001Acme</strong>
                        </div>
                    </fieldset>
                    <fieldset className="pt-info-card">
                        <legend>USER</legend>
                        <div>
                            <span>Name</span>
                            <strong>Alex Rivera</strong>
                        </div>
                        <div>
                            <span>Username</span>
                            <strong>alex@acme.com</strong>
                        </div>
                    </fieldset>
                </div>
            )}
        </aside>
    );
}

function SalesforcePage({
    overlayOpen,
    overlaySearch,
    caret,
    soqlHot,
    vscodeHot,
    interactive,
}: {
    overlayOpen: boolean;
    overlaySearch: string;
    caret: boolean;
    soqlHot?: boolean;
    vscodeHot?: boolean;
    interactive?: boolean;
}): ReactNode {
    const goToSlide = useTourNav();
    return (
        <div className="pt-lex">
            <SalesforceHeader />
            <SalesforceNav onAccounts={interactive ? () => goToSlide?.('overlay') : undefined} />
            <div className="pt-lex-body">
                <div className="pt-record">
                    <p className="pt-record-kicker">Account</p>
                    <h3>Acme Corp</h3>
                    <div className="pt-record-tabs">
                        <span className="is-active">Details</span>
                        <span>Related</span>
                        <span>News</span>
                    </div>
                    <dl className="pt-highlights">
                        <div>
                            <dt>Industry</dt>
                            <dd>Technology</dd>
                        </div>
                        <div>
                            <dt>Type</dt>
                            <dd>Customer</dd>
                        </div>
                        <div>
                            <dt>Phone</dt>
                            <dd>(415) 555-0142</dd>
                        </div>
                        <div>
                            <dt>Owner</dt>
                            <dd>Alex Rivera</dd>
                        </div>
                    </dl>
                    <div className="pt-skel-block">
                        <i />
                        <i />
                        <i />
                        <i />
                    </div>
                </div>
            </div>
            <OverlayDock
                overlayOpen={overlayOpen}
                soqlHot={soqlHot}
                vscodeHot={vscodeHot}
                onOpenSoql={interactive ? () => goToSlide?.('soql') : undefined}
                onOpenEditor={interactive ? () => goToSlide?.('editor') : undefined}
            />
            {overlayOpen ? (
                <OverlayPanel
                    search={overlaySearch}
                    caret={caret}
                    soqlHot={soqlHot}
                    vscodeHot={vscodeHot}
                    onOpenSoql={interactive ? () => goToSlide?.('soql') : undefined}
                    onOpenEditor={interactive ? () => goToSlide?.('editor') : undefined}
                />
            ) : null}
        </div>
    );
}

const NAV_ITEMS: Array<{
    group: string;
    items: Array<{ id: TourSlideId; label: string; icon: ReactNode }>;
}> = [
    {
        group: 'Data',
        items: [
            { id: 'soql', label: 'SOQL Explorer', icon: <Database size={12} strokeWidth={2} /> },
            { id: 'overlay', label: 'Record Viewer', icon: <Table2 size={12} strokeWidth={2} /> },
        ],
    },
    {
        group: 'Code',
        items: [
            { id: 'editor', label: 'VS Code', icon: <SquareTerminal size={12} strokeWidth={2} /> },
            { id: 'soql', label: 'API Explorer', icon: <Globe size={12} strokeWidth={2} /> },
        ],
    },
    {
        group: 'Admin',
        items: [
            { id: 'workbench', label: 'Metadata', icon: <Package size={12} strokeWidth={2} /> },
            { id: 'workbench', label: 'SObject', icon: <Building2 size={12} strokeWidth={2} /> },
        ],
    },
];

const ACTIVE_NAV_LABEL: Record<TourSlideId, string> = {
    overlay: 'Record Viewer',
    soql: 'SOQL Explorer',
    editor: 'VS Code',
    workbench: 'Metadata',
    agent: 'Agent',
};

function ToolkitShell({
    activeApp,
    tabLabel,
    agentOpen,
    agent,
    children,
    interactive,
}: {
    activeApp: TourSlideId;
    tabLabel: string;
    agentOpen?: boolean;
    agent?: ReactNode;
    children: ReactNode;
    interactive?: boolean;
}): ReactNode {
    const goToSlide = useTourNav();
    return (
        <div className={classNames('pt-toolkit', agentOpen && 'is-agent')}>
            <aside className="pt-nav">
                <div className="pt-nav-brand">
                    <span>Workbench</span>
                    <span className="pt-beta">Beta</span>
                </div>
                {NAV_ITEMS.map(section => (
                    <div key={section.group} className="pt-nav-group">
                        <p>{section.group}</p>
                        {section.items.map(item => (
                            <button
                                key={`${section.group}-${item.label}`}
                                type="button"
                                className={classNames(
                                    'pt-nav-item',
                                    ACTIVE_NAV_LABEL[activeApp] === item.label && 'is-active'
                                )}
                                onClick={interactive ? () => goToSlide?.(item.id) : undefined}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                ))}
                <button
                    type="button"
                    className={classNames(
                        'pt-nav-item pt-nav-agent',
                        activeApp === 'agent' && 'is-active'
                    )}
                    onClick={interactive ? () => goToSlide?.('agent') : undefined}
                >
                    <Bot size={12} strokeWidth={2} />
                    Agent
                </button>
            </aside>
            <div className="pt-toolkit-main">
                <header className="pt-context">
                    <span className="pt-context-name">Workbench</span>
                    <span className="pt-beta">Beta</span>
                    <span className="pt-tab is-active">{tabLabel}</span>
                    <span className="pt-context-end">
                        <Settings size={13} strokeWidth={1.75} aria-hidden />
                        <button
                            type="button"
                            className={classNames('pt-agent-toggle', agentOpen && 'is-active')}
                            onClick={interactive ? () => goToSlide?.('agent') : undefined}
                            aria-label="Toggle agent"
                        >
                            <PanelRight size={13} strokeWidth={1.75} />
                        </button>
                    </span>
                </header>
                <div className="pt-canvas">
                    {children}
                    {agentOpen ? agent : null}
                </div>
            </div>
        </div>
    );
}

function SoqlBody({
    draft,
    caret,
    resultsVisible,
    sendPulse,
}: {
    draft: string;
    caret: boolean;
    resultsVisible: boolean;
    sendPulse?: boolean;
}): ReactNode {
    return (
        <div className="pt-soql">
            <div className="pt-soql-toolbar">
                <span>Acme · API 62.0</span>
                <span className={classNames('pt-run', sendPulse && 'is-pulse')}>
                    <Play size={11} strokeWidth={2.2} aria-hidden />
                    Run
                </span>
            </div>
            <pre className="pt-soql-editor">
                {draft || <span className="pt-placeholder">SELECT Id, Name FROM Account</span>}
                {caret ? <Caret /> : null}
            </pre>
            {resultsVisible ? (
                <table className="pt-results">
                    <thead>
                        <tr>
                            <th>Id</th>
                            <th>Name</th>
                            <th>Industry</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>001xx000003DHP0</td>
                            <td>Acme Corp</td>
                            <td>Technology</td>
                        </tr>
                        <tr>
                            <td>001xx000003DHP1</td>
                            <td>Globex</td>
                            <td>Manufacturing</td>
                        </tr>
                        <tr>
                            <td>001xx000003DHP2</td>
                            <td>Initech</td>
                            <td>Finance</td>
                        </tr>
                    </tbody>
                </table>
            ) : (
                <div className="pt-soql-empty">Run a query to see records</div>
            )}
        </div>
    );
}

function MetadataBody({
    filter,
    caret,
    selected,
}: {
    filter: string;
    caret: boolean;
    selected: boolean;
}): ReactNode {
    const q = filter.toLowerCase();
    const objects = ['Account', 'Contact', 'Opportunity'].filter(
        name => !q || name.toLowerCase().includes(q)
    );
    return (
        <div className="pt-meta">
            <div className="pt-meta-tree">
                <div className="pt-meta-filter">
                    <Search size={11} strokeWidth={2} aria-hidden />
                    <span>
                        {filter || 'Filter metadata'}
                        {caret ? <Caret /> : null}
                    </span>
                </div>
                <div className="pt-tree-group">
                    <span>
                        <ChevronDown size={11} strokeWidth={2} /> CustomObject
                    </span>
                    {objects.map(name => (
                        <button
                            key={name}
                            type="button"
                            className={selected && name === 'Account' ? 'is-active' : undefined}
                        >
                            <Folder size={11} strokeWidth={2} /> {name}
                        </button>
                    ))}
                </div>
                <div className="pt-tree-group">
                    <span>
                        <ChevronRight size={11} strokeWidth={2} /> PermissionSet
                    </span>
                    <span>
                        <ChevronRight size={11} strokeWidth={2} /> Profile
                    </span>
                    <span>
                        <ChevronRight size={11} strokeWidth={2} /> Layout
                    </span>
                </div>
            </div>
            <div className="pt-meta-detail">
                {selected ? (
                    <>
                        <header>
                            <Package size={14} strokeWidth={1.75} />
                            Account
                            <span className="pt-pill">CustomObject</span>
                        </header>
                        <dl>
                            <div>
                                <dt>Label</dt>
                                <dd>Account</dd>
                            </div>
                            <div>
                                <dt>API Name</dt>
                                <dd>Account</dd>
                            </div>
                            <div>
                                <dt>Fields</dt>
                                <dd>186</dd>
                            </div>
                            <div>
                                <dt>Last modified</dt>
                                <dd>Alex Rivera · 2h ago</dd>
                            </div>
                        </dl>
                        <div className="pt-skel-block">
                            <i />
                            <i />
                            <i />
                        </div>
                    </>
                ) : (
                    <p className="pt-soql-empty">Select a component to inspect it</p>
                )}
            </div>
        </div>
    );
}

function EditorBody({
    typedSource,
    caret,
    dirty,
    paletteOpen,
    palettePhase,
    paletteQuery,
    paletteName,
    paletteCaret,
    bundleReady,
}: {
    typedSource: string;
    caret: boolean;
    dirty: boolean;
    paletteOpen: boolean;
    palettePhase: PalettePhase;
    paletteQuery: string;
    paletteName: string;
    paletteCaret: boolean;
    bundleReady: boolean;
}): ReactNode {
    const lines = typedSource.length > 0 ? typedSource.split('\n') : [''];
    const lastLine = lines[lines.length - 1] ?? '';
    const paletteValue =
        palettePhase === 'name'
            ? paletteName || 'Component name'
            : paletteQuery || 'Type a command';
    return (
        <div className="pt-vscode">
            <aside className="pt-vscode-rail" aria-hidden>
                <FileCode2 size={14} strokeWidth={1.75} />
                <Search size={14} strokeWidth={1.75} />
                <Code2 size={14} strokeWidth={1.75} />
                <Settings size={14} strokeWidth={1.75} />
            </aside>
            <div className="pt-vscode-files">
                <p>FORCE-APP</p>
                <span className="pt-tree-row">force-app/main/default/lwc</span>
                {bundleReady ? (
                    <>
                        <span className="pt-tree-row is-folder">accountHighlight</span>
                        <span className="pt-tree-row is-file is-active">
                            {dirty ? <i className="pt-dirty" aria-hidden /> : null}
                            accountHighlight.html
                        </span>
                        <span className="pt-tree-row is-file">accountHighlight.js</span>
                        <span className="pt-tree-row is-file">accountHighlight.js-meta.xml</span>
                    </>
                ) : (
                    <span className="pt-tree-row is-muted">No components yet</span>
                )}
            </div>
            <div className="pt-vscode-main">
                <div className="pt-vscode-tabs">
                    {bundleReady ? (
                        <span className="pt-vscode-tab is-active">
                            {dirty ? <i className="pt-dirty" aria-hidden /> : null}
                            accountHighlight.html
                        </span>
                    ) : (
                        <span className="pt-vscode-tab is-empty">Welcome</span>
                    )}
                </div>
                <div className="pt-vscode-editor">
                    {lines.map((line, i) => (
                        <div key={`ln-${i}`} className="pt-code-line">
                            <em>{i + 1}</em>
                            <span>
                                {line}
                                {caret && i === lines.length - 1 ? <Caret /> : null}
                            </span>
                        </div>
                    ))}
                </div>
                <footer className="pt-vscode-status">
                    <span>{dirty ? '1 unsaved' : 'Saved'}</span>
                    <span>HTML</span>
                    <span>
                        Ln {lines.length}, Col {lastLine.length + 1}
                    </span>
                </footer>
                {paletteOpen ? (
                    <div className="pt-palette" aria-label="Command palette">
                        <div className="pt-palette-input">
                            <Search size={12} strokeWidth={2} aria-hidden />
                            <span>
                                {paletteValue}
                                {paletteCaret ? <Caret /> : null}
                            </span>
                        </div>
                        {palettePhase === 'command' ? (
                            <ul>
                                <li className="is-active">SFDX: Create Lightning Web Component</li>
                                <li>SFDX: Create Apex Class</li>
                            </ul>
                        ) : (
                            <p className="pt-palette-hint">New Lightning web component</p>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

const FORM_TOOL: Record<Exclude<FormFocus, null>, string> = {
    name: 'browser_fill · Name',
    email: 'browser_fill · Email',
    order: 'browser_fill · Order #',
    message: 'browser_fill · Message',
    submit: 'Clicked Submit',
};

function SidePanelForm({
    assistant,
    streaming,
    formFocus,
    formName,
    formEmail,
    formOrder,
    formMessage,
    formSubmitPulse,
}: {
    assistant: string;
    streaming?: boolean;
    formFocus: FormFocus;
    formName: string;
    formEmail: string;
    formOrder: string;
    formMessage: string;
    formSubmitPulse: boolean;
}): ReactNode {
    return (
        <div className="pt-sidepanel-scene">
            <div className="pt-acme-site">
                <header className="pt-acme-header">
                    <strong>Acme</strong>
                    <nav>
                        <span>Help Center</span>
                        <span className="is-active">Contact</span>
                        <span>Status</span>
                    </nav>
                </header>
                <main className="pt-acme-form">
                    <p className="pt-acme-kicker">Support</p>
                    <h3>How can we help?</h3>
                    <label
                        className={classNames('pt-form-field', formFocus === 'name' && 'is-focus')}
                    >
                        Name
                        <span>{formName || 'Full name'}</span>
                    </label>
                    <label
                        className={classNames('pt-form-field', formFocus === 'email' && 'is-focus')}
                    >
                        Email
                        <span>{formEmail || 'you@company.com'}</span>
                    </label>
                    <label
                        className={classNames('pt-form-field', formFocus === 'order' && 'is-focus')}
                    >
                        Order #<span>{formOrder || 'e.g. 1842'}</span>
                    </label>
                    <label
                        className={classNames(
                            'pt-form-field is-area',
                            formFocus === 'message' && 'is-focus'
                        )}
                    >
                        Message
                        <span>{formMessage || 'Describe the issue'}</span>
                    </label>
                    <span
                        className={classNames(
                            'pt-form-submit',
                            (formFocus === 'submit' || formSubmitPulse) && 'is-pulse'
                        )}
                    >
                        Submit
                    </span>
                </main>
            </div>
            <aside className="pt-sidepanel" aria-label="Workbench side panel">
                <header>
                    <Bot size={13} strokeWidth={1.75} />
                    Workbench
                    <Settings size={12} strokeWidth={1.75} aria-hidden />
                </header>
                <div className="pt-agent-thread">
                    <div className="pt-bubble is-user">
                        Fill this support form for Alex Rivera, order 1842.
                    </div>
                    {formFocus ? (
                        <div
                            className={classNames('pt-tool', formFocus === 'submit' && 'is-action')}
                        >
                            {formFocus === 'submit' ? (
                                <MousePointerClick size={11} strokeWidth={2} />
                            ) : (
                                <Pencil size={11} strokeWidth={2} />
                            )}
                            {FORM_TOOL[formFocus]}
                        </div>
                    ) : null}
                    {assistant ? (
                        <div className="pt-bubble is-assistant">
                            {assistant}
                            {streaming ? <Caret /> : null}
                        </div>
                    ) : (
                        <div className="pt-bubble is-assistant is-pending">
                            <span className="pt-pulse" aria-hidden />
                            Looking at the page…
                        </div>
                    )}
                </div>
                <div className="pt-composer">
                    <span>Ask the agent to fill this form…</span>
                    <Send size={12} strokeWidth={2} aria-hidden />
                </div>
            </aside>
        </div>
    );
}

function LoadingOverlay({ label }: { label: 'editor' | 'soql' }): ReactNode {
    return (
        <div className="pt-loading" aria-hidden>
            <span className="pt-spinner" />
            {label === 'editor' ? 'Opening VS Code…' : 'Opening SOQL Explorer…'}
        </div>
    );
}

export function HomeFlowWireframe({ scene }: { scene: FlowScene }): ReactNode {
    const soqlBody = (
        <SoqlBody
            draft={scene.soqlDraft}
            caret={scene.caret === 'soql'}
            resultsVisible={scene.resultsVisible}
            sendPulse={scene.sendPulse}
        />
    );
    const editorBody = (
        <EditorBody
            typedSource={scene.editorTyped}
            caret={scene.caret === 'editor'}
            dirty={scene.editorDirty}
            paletteOpen={scene.paletteOpen}
            palettePhase={scene.palettePhase}
            paletteQuery={scene.paletteQuery}
            paletteName={scene.paletteName}
            paletteCaret={scene.caret === 'palette'}
            bundleReady={scene.bundleReady}
        />
    );
    let body: ReactNode;
    if (scene.view === 'salesforce') {
        body = (
            <SalesforcePage
                overlayOpen={scene.overlayOpen}
                overlaySearch={scene.overlaySearch}
                caret={scene.caret === 'search'}
                soqlHot={scene.soqlHot}
                vscodeHot={scene.vscodeHot}
            />
        );
    } else if (scene.view === 'editor') {
        body = (
            <ToolkitShell activeApp="editor" tabLabel="VS Code">
                {editorBody}
            </ToolkitShell>
        );
    } else if (scene.view === 'soql') {
        body = (
            <ToolkitShell activeApp="soql" tabLabel="SOQL Explorer">
                {soqlBody}
            </ToolkitShell>
        );
    } else {
        body = (
            <SidePanelForm
                assistant={scene.assistant}
                streaming={Boolean(scene.assistant) && scene.formFocus !== 'submit'}
                formFocus={scene.formFocus}
                formName={scene.formName}
                formEmail={scene.formEmail}
                formOrder={scene.formOrder}
                formMessage={scene.formMessage}
                formSubmitPulse={scene.formSubmitPulse}
            />
        );
    }
    return (
        <div
            className="pt-stage"
            data-flow-view={scene.view}
            style={{ width: AUTHORED_WIDTH, height: AUTHORED_HEIGHT }}
        >
            {body}
            {scene.loadingTarget ? <LoadingOverlay label={scene.loadingTarget} /> : null}
        </div>
    );
}

export function SlideWireframe({
    slideId,
    play,
}: {
    slideId: TourSlideId;
    play?: SlidePlay;
}): ReactNode {
    const scene = play ?? completedSlidePlay(slideId);
    let body: ReactNode;
    if (slideId === 'overlay') {
        body = (
            <SalesforcePage
                overlayOpen={scene.overlayOpen}
                overlaySearch={scene.overlaySearch}
                caret={scene.overlayCaret}
                vscodeHot={scene.vscodeHot}
                soqlHot={scene.soqlHot}
                interactive
            />
        );
    } else if (slideId === 'editor') {
        body = (
            <ToolkitShell activeApp="editor" tabLabel="VS Code" interactive>
                <EditorBody
                    typedSource={scene.editorTyped}
                    caret={scene.editorCaret}
                    dirty={scene.editorDirty}
                    paletteOpen={scene.paletteOpen}
                    palettePhase={scene.palettePhase}
                    paletteQuery={scene.paletteQuery}
                    paletteName={scene.paletteName}
                    paletteCaret={scene.paletteCaret}
                    bundleReady={scene.bundleReady}
                />
            </ToolkitShell>
        );
    } else if (slideId === 'workbench') {
        body = (
            <ToolkitShell activeApp="workbench" tabLabel="Metadata Explorer" interactive>
                <MetadataBody
                    filter={scene.metaFilter}
                    caret={scene.metaCaret}
                    selected={scene.metaSelected}
                />
            </ToolkitShell>
        );
    } else if (slideId === 'soql') {
        body = (
            <ToolkitShell activeApp="soql" tabLabel="SOQL Explorer" interactive>
                <SoqlBody
                    draft={scene.soqlDraft}
                    caret={scene.soqlCaret}
                    resultsVisible={scene.resultsVisible}
                    sendPulse={scene.sendPulse}
                />
            </ToolkitShell>
        );
    } else {
        body = (
            <SidePanelForm
                assistant={scene.assistant}
                streaming={scene.streaming}
                formFocus={scene.formFocus}
                formName={scene.formName}
                formEmail={scene.formEmail}
                formOrder={scene.formOrder}
                formMessage={scene.formMessage}
                formSubmitPulse={scene.formSubmitPulse}
            />
        );
    }
    return (
        <div
            className="pt-stage"
            data-tour-slide={slideId}
            style={{ width: AUTHORED_WIDTH, height: AUTHORED_HEIGHT }}
        >
            {body}
        </div>
    );
}
