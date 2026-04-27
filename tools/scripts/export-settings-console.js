/* eslint-env browser, webextensions */
/**
 * Workbench – Storage Diagnostic & Export Snippet
 *
 * Paste this into the browser DevTools Console while the Workbench app or extension
 * is open. It captures every signal needed to diagnose post-upgrade data loss
 * (saved queries / apex / api) and produces a JSON file you can import into the
 * new app (Settings → Storage → Cache → Import).
 *
 * Captured payload:
 *   - extensionId        chrome.runtime.id (undefined on the web app)
 *   - url / userAgent    run context
 *   - localStorage       full dump (this is where recent queries/apex/api live)
 *   - chromeStorageLocal full dump of chrome.storage.local (cacheManager data)
 *   - summary            key counts + lsb.* keys found, for quick triage
 *
 * Usage:
 *   1. Open the OLD version of Workbench (old extension popup / side panel / tab, or
 *      the old web app). If the extension is uninstalled, reinstall it temporarily.
 *   2. Open DevTools (F12 / Cmd+Option+I) on that page.
 *   3. Paste this whole script in the Console tab and press Enter.
 *   4. A JSON file will be downloaded.
 *   5. Repeat on the NEW version. The two files together tell us whether the
 *      extension ID changed, key shapes changed, or data is simply missing.
 *   6. Import the old file via: Settings → Storage → Cache → Import.
 */
(async function workbenchStorageExport() {
    const result = {
        capturedAt: new Date().toISOString(),
        url: typeof location !== 'undefined' ? location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        extensionId: null,
        manifestVersion: null,
        localStorage: {},
        chromeStorageLocal: null,
        summary: {},
    };

    // Extension identity (detects ID rotation across upgrades)
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            result.extensionId = chrome.runtime.id;
            try {
                result.manifestVersion = chrome.runtime.getManifest
                    ? chrome.runtime.getManifest().version
                    : null;
            } catch {
                /* not all contexts allow getManifest */
            }
        }
    } catch {
        /* not an extension context */
    }

    // localStorage dump (recent queries/apex/api live here via document.ts)
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const raw = localStorage.getItem(key);
            try {
                result.localStorage[key] = JSON.parse(raw);
            } catch {
                result.localStorage[key] = raw;
            }
        }
    } catch (err) {
        result.localStorage = { __error: String(err) };
    }

    // chrome.storage.local dump (cacheManager / saved queries/apex/api files)
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            result.chromeStorageLocal = await new Promise(resolve => {
                chrome.storage.local.get(null, items => {
                    if (chrome.runtime.lastError) {
                        resolve({ __error: chrome.runtime.lastError.message });
                    } else {
                        resolve(items || {});
                    }
                });
            });
        }
    } catch (err) {
        result.chromeStorageLocal = { __error: String(err) };
    }

    // Summary — fast triage for the data-loss investigation
    const lsKeys = Object.keys(result.localStorage);
    const csKeys = result.chromeStorageLocal ? Object.keys(result.chromeStorageLocal) : [];
    const lsbLocalKeys = lsKeys.filter(k => /lsb\./i.test(k));
    const lsbChromeKeys = csKeys.filter(k => /lsb\./i.test(k));
    result.summary = {
        localStorageKeyCount: lsKeys.length,
        chromeStorageLocalKeyCount: csKeys.length,
        lsbLocalStorageKeys: lsbLocalKeys,
        lsbChromeStorageKeys: lsbChromeKeys,
        hasRecentQueries: lsbLocalKeys.some(k => k.endsWith('lsb.recentQueries')),
        hasRecentApex: lsbLocalKeys.some(k => k.endsWith('lsb.recentApex')),
        hasRecentApi: lsbLocalKeys.some(k => k.endsWith('lsb.recentApi')),
    };

    if (lsKeys.length === 0 && csKeys.length === 0) {
        console.warn('[Workbench] No storage found on this page.');
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = result.extensionId ? 'ext-' + result.extensionId.slice(0, 8) : 'web';
    const filename = 'workbench-storage-' + suffix + '-' + stamp + '.json';
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);

    console.log(
        '[Workbench] Diagnostic export written: ' +
            filename +
            '\n  extensionId=' +
            (result.extensionId || '(web)') +
            '\n  localStorage keys=' +
            lsKeys.length +
            ' (lsb.*: ' +
            lsbLocalKeys.length +
            ')' +
            '\n  chrome.storage.local keys=' +
            csKeys.length +
            ' (lsb.*: ' +
            lsbChromeKeys.length +
            ')' +
            '\nShare this file so we can compare old vs new and decide the migration path.'
    );
})();
