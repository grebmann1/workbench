"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const launchIntent_1 = require("./launchIntent");
(0, node_test_1.default)('parseLaunchIntent returns the default app intent when none is provided', () => {
    strict_1.default.deepEqual((0, launchIntent_1.parseLaunchIntent)(['electron', '.']), (0, launchIntent_1.createDefaultLaunchIntent)());
});
(0, node_test_1.default)('parseLaunchIntent restores a serialized org intent', () => {
    const serializedIntent = (0, launchIntent_1.serializeLaunchIntent)({
        target: 'org',
        orgAlias: 'demo-org',
    });
    strict_1.default.deepEqual((0, launchIntent_1.parseLaunchIntent)(['electron', '.', serializedIntent]), {
        target: 'org',
        orgAlias: 'demo-org',
    });
});
(0, node_test_1.default)('parseLaunchIntent falls back to the default app intent for invalid payloads', () => {
    strict_1.default.deepEqual((0, launchIntent_1.parseLaunchIntent)(['electron', '.', '--desktop-intent=not-a-valid-payload']), (0, launchIntent_1.createDefaultLaunchIntent)());
});
(0, node_test_1.default)('parseLaunchIntent restores a serialized v2 open page command', () => {
    const serializedIntent = (0, launchIntent_1.serializeLaunchIntent)({
        v: 2,
        type: 'openPage',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
        route: {
            applicationName: 'soql',
            state: {
                query: 'SELECT Id FROM Account LIMIT 10',
            },
        },
    });
    strict_1.default.deepEqual((0, launchIntent_1.parseLaunchIntent)(['electron', '.', serializedIntent]), {
        v: 2,
        type: 'openPage',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
        route: {
            applicationName: 'soql',
            state: {
                query: 'SELECT Id FROM Account LIMIT 10',
            },
        },
    });
});
(0, node_test_1.default)('normalizeDesktopCommand converts legacy app and org intents to v2 commands', () => {
    strict_1.default.deepEqual((0, launchIntent_1.normalizeDesktopCommand)({ target: 'app' }), { v: 2, type: 'openApp' });
    strict_1.default.deepEqual((0, launchIntent_1.normalizeDesktopCommand)({ target: 'org', orgAlias: 'demo-org' }), {
        v: 2,
        type: 'openOrg',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
    });
});
