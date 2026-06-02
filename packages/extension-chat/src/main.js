import '@lwc/synthetic-shadow';
import './desktop/chromeEnrich.js';

import extensionRoot from 'extension/root';
import { APPLICATION, store } from 'core/store';
import jsforce from 'imported/jsforce';
import { createElement } from 'lwc';
import {
    CACHE_CONFIG,
    chromeStore,
    getAiProviderFromConfig,
    getLlmProviderConfigCacheKeys,
    loadExtensionConfigFromCache,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import skeletonDirectView from 'skeleton/directView';
import skeletonFullView from 'skeleton/fullView';
import skeletonSingleToolView from 'skeleton/singleToolView';
import { bootstrapChatCommands } from './chatCommandBootstrap.js';

const init = async () => {
    window.defaultStore = await chromeStore('local');
    window.settingsStore = await chromeStore('sync');
    window.Prism = Prism;
    window.jsforceSettings = {
        clientId:
            '3MVG9_kZcLde7U5oNdaqndT3T9qa54eaA.ycC6APuOkYzRP286pPeOvwOqAQ2ue7l5ejNAxPYj4xTbWn3zS6Y',
        chromeId: 'konbmllgicfccombdckckakhnmejjoei',
        redirectUri:
            typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL
                ? chrome.identity.getRedirectURL()
                : 'https://www.sf-workbench.com/chrome/callback',
    };
    window.jsforce = jsforce;

    const providerCache = await loadExtensionConfigFromCache(getLlmProviderConfigCacheKeys());
    const providerConfigs = resolveLlmProviderConfigMap(providerCache);
    const aiProvider = getAiProviderFromConfig(providerCache);
    store.dispatch(APPLICATION.reduxSlice.actions.updateSettings(providerCache));
    store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
    store.dispatch(APPLICATION.reduxSlice.actions.updateAiProvider({ aiProvider }));
    store.dispatch(
        APPLICATION.reduxSlice.actions.updateSettings({
            [CACHE_CONFIG.AI_PROVIDER.key]: aiProvider,
        })
    );
};

window.extension_initLwc = async variant => {
    await init();
    if (variant === 'chat') {
        bootstrapChatCommands();
    }
    const elm = createElement('extension-root', { is: extensionRoot });
    Object.assign(elm, {
        variant,
    });
    document.body.appendChild(elm);
    document.getElementById('sidepanel-boot')?.remove();
};

window.extension_initApp = async variant => {
    await init();
    const elm = createElement('skeleton-full-view', { is: skeletonFullView });
    Object.assign(elm, {
        variant,
    });
    document.body.appendChild(elm);
};

window.extension_initVscode = async () => {
    await init();
    const elm = createElement('skeleton-direct-view', { is: skeletonDirectView });
    Object.assign(elm, {
        variant: 'vscode',
    });
    document.body.appendChild(elm);
};

window.extension_singleInstance = async () => {
    await init();
    const elm = createElement('skeleton-direct-view', { is: skeletonDirectView });
    Object.assign(elm, {
        variant: 'electron',
        isSingleInstance: true,
    });
    document.body.appendChild(elm);
};

window.extension_initSingleTool = async variant => {
    await init();
    const elm = createElement('skeleton-single-tool-view', { is: skeletonSingleToolView });
    Object.assign(elm, {
        variant,
    });
    document.body.appendChild(elm);
};
