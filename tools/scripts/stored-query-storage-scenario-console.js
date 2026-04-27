/* eslint-env browser, webextensions */
/**
 * Workbench - Stored Query Storage Scenario Probe
 *
 * Paste this into DevTools on the affected Workbench extension/app page.
 *
 * This script is intentionally narrower than export-settings-console.js. It tests
 * the suspected post-update scenario where saved SOQL/API files exist, but were
 * restored into chrome.storage.local while the app reads them from localStorage.
 *
 * Optional before running:
 *   window.WORKBENCH_STORED_QUERY_SCENARIO_OPTIONS = {
 *       currentAlias: 'your-org-alias',
 *       applyRecovery: false, // set true only after reviewing the dry-run report
 *       downloadReport: true
 *   };
 */
(function bootstrap(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }

    const api = factory();
    root.workbenchStoredQueryScenario = api;
    api.runBrowserScenario().catch(error => {
        console.error('[Workbench] Stored query scenario probe failed', error);
    });
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildApi() {
    const DEFAULT_DOCUMENT_KEYS = ['QUERYFILES', 'APIFILES', 'APEXFILES', 'OPENAPI_SCHEMAS_FILES'];
    const RECENT_SUFFIX_RE =
        /lsb\.(recentQueries|recentApi|recentApex|recentPlatformEvents|recentRecordViewer)$/;

    function safeJsonParse(raw) {
        if (raw === null || raw === undefined) {
            return { value: undefined, error: null };
        }
        if (typeof raw !== 'string') {
            return { value: raw, error: null };
        }
        try {
            return { value: JSON.parse(raw), error: null };
        } catch (error) {
            return { value: undefined, error };
        }
    }

    function summarizeStoredValue(raw) {
        const parsed = safeJsonParse(raw);
        if (parsed.error) {
            return {
                exists: raw !== null && raw !== undefined,
                count: 0,
                type: typeof raw,
                error: parsed.error.message,
            };
        }

        const value = parsed.value;
        const isArray = Array.isArray(value);
        const isObject = value && typeof value === 'object' && !isArray;
        return {
            exists: value !== undefined,
            count: isArray ? value.length : isObject ? Object.keys(value).length : value ? 1 : 0,
            type: isArray ? 'array' : value === null ? 'null' : typeof value,
            value,
            error: null,
        };
    }

    function getDocumentStatus(localSummary, chromeSummary) {
        if (localSummary.error) {
            return 'malformed-local';
        }
        if (localSummary.count > 0) {
            return chromeSummary.count > 0 ? 'present-both' : 'ok-local';
        }
        if (chromeSummary.error) {
            return 'malformed-chrome';
        }
        if (chromeSummary.count > 0) {
            return 'wrong-backend';
        }
        return 'missing';
    }

    function getAliasesFromItems(items) {
        if (!Array.isArray(items)) return [];
        return Array.from(
            new Set(
                items
                    .filter(item => item && !item.isGlobal && item.alias)
                    .map(item => String(item.alias))
            )
        ).sort();
    }

    function getAliasVisibility(items, currentAlias) {
        if (!Array.isArray(items)) {
            return {
                totalItems: 0,
                visibleForCurrentAlias: 0,
                hiddenByAlias: 0,
                aliases: [],
            };
        }

        const visible = items.filter(item => {
            if (!item) return false;
            if (item.isGlobal) return true;
            if (!currentAlias) return false;
            return item.alias === currentAlias;
        });

        return {
            totalItems: items.length,
            visibleForCurrentAlias: visible.length,
            hiddenByAlias: items.length - visible.length,
            aliases: getAliasesFromItems(items),
        };
    }

    function getFolderWarnings(items) {
        if (!Array.isArray(items)) return [];
        const warnings = [];
        items.forEach(item => {
            const folder = item?.extra?.folder;
            if (folder === undefined || folder === null || folder === '') {
                return;
            }
            if (typeof folder !== 'string') {
                warnings.push({
                    id: item.id,
                    issue: 'folder-not-string',
                    value: folder,
                });
            }
        });
        return warnings;
    }

    function getRecentAliases(storageSnapshot) {
        return Object.keys(storageSnapshot || {})
            .filter(key => RECENT_SUFFIX_RE.test(key))
            .map(key => key.replace(/-lsb\..+$/, ''))
            .filter(Boolean)
            .sort();
    }

    function analyzeStorageScenario({
        localStorage = {},
        chromeStorageLocal = {},
        currentAlias = '',
        documentKeys = DEFAULT_DOCUMENT_KEYS,
    } = {}) {
        const documentReports = {};
        const aliasVisibility = {};
        const folderWarnings = {};

        documentKeys.forEach(key => {
            const local = summarizeStoredValue(localStorage[key]);
            const chrome = summarizeStoredValue(chromeStorageLocal?.[key]);
            const status = getDocumentStatus(local, chrome);
            documentReports[key] = {
                status,
                local: {
                    exists: local.exists,
                    count: local.count,
                    type: local.type,
                    error: local.error,
                },
                chromeStorageLocal: {
                    exists: chrome.exists,
                    count: chrome.count,
                    type: chrome.type,
                    error: chrome.error,
                },
            };

            const items = local.count > 0 ? local.value : chrome.value;
            aliasVisibility[key] = getAliasVisibility(items, currentAlias);
            folderWarnings[key] = getFolderWarnings(items);
        });

        const wrongBackendKeys = Object.entries(documentReports)
            .filter(([, report]) => report.status === 'wrong-backend')
            .map(([key]) => key);

        return {
            capturedAt: new Date().toISOString(),
            currentAlias: currentAlias || null,
            documentKeys: documentReports,
            aliasVisibility,
            folderWarnings,
            recentAliases: {
                localStorage: getRecentAliases(localStorage),
                chromeStorageLocal: getRecentAliases(chromeStorageLocal),
            },
            summary: {
                hasRecoverableWrongBackendDocuments: wrongBackendKeys.length > 0,
                recoverableWrongBackendKeys: wrongBackendKeys,
                hasMalformedLocalDocuments: Object.values(documentReports).some(
                    report => report.status === 'malformed-local'
                ),
                hasAliasHiddenQueryFiles:
                    aliasVisibility.QUERYFILES && aliasVisibility.QUERYFILES.hiddenByAlias > 0,
            },
        };
    }

    function getRecoverableWrongBackendKeys(report) {
        return report?.summary?.recoverableWrongBackendKeys || [];
    }

    function readBrowserLocalStorage() {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            out[key] = localStorage.getItem(key);
        }
        return out;
    }

    function readChromeStorageLocal() {
        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local ||
            typeof chrome.storage.local.get !== 'function'
        ) {
            return Promise.resolve({});
        }
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, items => {
                if (chrome.runtime?.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(items || {});
            });
        });
    }

    function restoreWrongBackendDocuments(report, chromeStorageLocal) {
        const keys = getRecoverableWrongBackendKeys(report);
        keys.forEach(key => {
            const value = chromeStorageLocal[key];
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
        return keys;
    }

    function downloadJson(filename, payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    }

    async function runBrowserScenario(options = {}) {
        const runtimeOptions = {
            currentAlias: '',
            applyRecovery: false,
            downloadReport: true,
            ...(typeof globalThis !== 'undefined'
                ? globalThis.WORKBENCH_STORED_QUERY_SCENARIO_OPTIONS || {}
                : {}),
            ...options,
        };

        const localSnapshot = readBrowserLocalStorage();
        const chromeSnapshot = await readChromeStorageLocal();
        const report = analyzeStorageScenario({
            localStorage: localSnapshot,
            chromeStorageLocal: chromeSnapshot,
            currentAlias: runtimeOptions.currentAlias,
        });

        console.group('[Workbench] Stored query storage scenario');
        console.log('Current alias:', report.currentAlias || '(not provided)');
        console.table(
            Object.entries(report.documentKeys).map(([key, value]) => ({
                key,
                status: value.status,
                localCount: value.local.count,
                chromeCount: value.chromeStorageLocal.count,
                localError: value.local.error || '',
                chromeError: value.chromeStorageLocal.error || '',
            }))
        );
        console.log('Alias visibility:', report.aliasVisibility);
        console.log('Recent aliases:', report.recentAliases);

        if (report.summary.hasRecoverableWrongBackendDocuments) {
            console.warn(
                '[Workbench] Recoverable wrong-backend document keys:',
                report.summary.recoverableWrongBackendKeys
            );
            if (runtimeOptions.applyRecovery) {
                const restored = restoreWrongBackendDocuments(report, chromeSnapshot);
                console.warn(
                    '[Workbench] Restored to localStorage. Reload Workbench and re-check saved items.',
                    restored
                );
            } else {
                console.warn(
                    '[Workbench] Dry run only. To copy these keys into localStorage, run again with ' +
                        'window.WORKBENCH_STORED_QUERY_SCENARIO_OPTIONS = { applyRecovery: true, currentAlias: "..." }'
                );
            }
        }

        if (report.summary.hasAliasHiddenQueryFiles) {
            console.warn(
                '[Workbench] QUERYFILES contains items hidden by alias. Compare currentAlias with:',
                report.aliasVisibility.QUERYFILES.aliases
            );
        }

        if (runtimeOptions.downloadReport) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJson(`workbench-stored-query-scenario-${stamp}.json`, {
                report,
                options: runtimeOptions,
            });
        }

        console.groupEnd();
        return report;
    }

    return {
        analyzeStorageScenario,
        getRecoverableWrongBackendKeys,
        restoreWrongBackendDocuments,
        runBrowserScenario,
    };
});
