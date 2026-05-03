/**
 * Pure OpenAPI helpers — everything that does NOT require a runtime parser.
 *
 * The actual `dereference()` / `yaml.load()` / sampler calls live in the API
 * app because they rely on browser-only asset paths (`imported/openapi-parser`)
 * and the `openapi-sampler` npm package. Keeping the pure tree-building in
 * shared lets it be unit-tested in Node and re-used by CLI / agent tool.
 */

import { guid } from '../ids';

type OpenApiSpec = {
    info?: { title?: string };
    servers?: Array<{ url?: string }>;
    paths?: Record<string, Record<string, unknown>>;
};

type TreeNodeBase = {
    id: string;
    name: string;
    title?: string;
    type: 'root' | 'folder' | 'method';
    children?: TreeNode[];
    extra?: unknown;
    icon?: string;
    keywords?: string[];
};

type TreeNode = TreeNodeBase;

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

/**
 * Build a hierarchical tree (root → folder → folder → method) from an
 * OpenAPI spec. This is the shape consumed by the API app's schema tree UI.
 *
 * @param openApi fully-dereferenced OpenAPI 3.x spec (or any shape with
 *                `info`, `paths`, `servers`).
 */
export const buildApiTreeItems = (openApi: OpenApiSpec | undefined | null): TreeNode[] => {
    if (!openApi || !openApi.paths) return [];

    const name = openApi?.info?.title;
    const root: TreeNode = {
        id: (name ? name : guid()).toLowerCase(), // Important to lowercase for Redux
        name: name ? name : 'API',
        type: 'root',
        children: [],
        extra: {
            ...(openApi.info || {}),
            servers: openApi.servers || [],
        },
    };

    for (const [path, pathItem] of Object.entries(openApi.paths)) {
        insertPath(root, path, pathItem as Record<string, any>);
    }
    return [root];
};

const insertPath = (root: TreeNode, path: string, pathItem: Record<string, any>): void => {
    const segments = path.split('/').filter(Boolean);
    let current = root;
    let fullPath = '';

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        fullPath += '/' + segment;
        let node = current.children?.find(
            child => child.id === fullPath && child.type === 'folder'
        );
        if (!node) {
            node = {
                id: fullPath,
                name: segment,
                title: fullPath,
                type: 'folder',
                children: [],
                extra: i === segments.length - 1 ? pathItem : undefined,
            };
            current.children = current.children || [];
            current.children.push(node);
        }
        current = node;
    }

    for (const [method, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method)) continue;
        const op = operation as Record<string, any>;
        const keywords = [
            path,
            op?.summary,
            op?.operationId,
            ...(Array.isArray(op?.tags) ? op.tags : []),
        ].filter(Boolean) as string[];
        current.children = current.children || [];
        current.children.push({
            id: `${path}:${method}`,
            name: `${method.toUpperCase()} ${path}`,
            title: op?.summary || `${method.toUpperCase()} ${path}`,
            icon: `api:${method}`,
            type: 'method',
            keywords,
            extra: {
                ...op,
                path,
                method,
                pathItem,
            },
        });
    }
};

/**
 * Extract the list of server URLs from a parsed spec. Returns `[]` when the
 * `servers` array is missing or empty.
 */
export const getServerUrls = (openApi: OpenApiSpec | undefined | null): string[] => {
    if (!openApi?.servers) return [];
    return openApi.servers
        .map(s => s?.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
};
