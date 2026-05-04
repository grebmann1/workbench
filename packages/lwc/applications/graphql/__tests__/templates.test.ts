import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SALESFORCE_GRAPHQL_TEMPLATES } from '../templates.ts';

type GraphqlTemplate = {
    id: string;
    name: string;
    title: string;
    icon: string;
    body: string;
    variables?: string;
};

type GraphqlTemplateFolder = {
    id: string;
    name: string;
    icon: string;
    children: Array<GraphqlTemplate | GraphqlTemplateFolder>;
};

type AnyNode = GraphqlTemplate | GraphqlTemplateFolder;

function isFolder(node: AnyNode): node is GraphqlTemplateFolder {
    return Array.isArray((node as GraphqlTemplateFolder).children);
}

function collectLeaves(node: AnyNode, acc: GraphqlTemplate[] = []): GraphqlTemplate[] {
    if (isFolder(node)) {
        for (const child of node.children) collectLeaves(child, acc);
    } else {
        acc.push(node);
    }
    return acc;
}

function collectAllIds(node: AnyNode, acc: string[] = []): string[] {
    acc.push(node.id);
    if (isFolder(node)) {
        for (const child of node.children) collectAllIds(child, acc);
    }
    return acc;
}

test('graphql/catalog: root is a folder with children', () => {
    assert.ok(isFolder(SALESFORCE_GRAPHQL_TEMPLATES), 'root must be a folder');
    assert.ok(
        Array.isArray(SALESFORCE_GRAPHQL_TEMPLATES.children) &&
            SALESFORCE_GRAPHQL_TEMPLATES.children.length > 0,
        'root must have children'
    );
});

test('graphql/catalog: tree has at least 12 leaves', () => {
    const leaves = collectLeaves(SALESFORCE_GRAPHQL_TEMPLATES);
    assert.ok(leaves.length >= 12, `expected >= 12 leaves, got ${leaves.length}`);
});

test('graphql/catalog: every leaf has id, name, body, icon', () => {
    const leaves = collectLeaves(SALESFORCE_GRAPHQL_TEMPLATES);
    for (const leaf of leaves) {
        assert.ok(leaf.id && leaf.id.length > 0, `leaf missing id: ${JSON.stringify(leaf)}`);
        assert.ok(leaf.name && leaf.name.length > 0, `leaf ${leaf.id} missing name`);
        assert.ok(leaf.icon && leaf.icon.length > 0, `leaf ${leaf.id} missing icon`);
        assert.ok(
            typeof leaf.body === 'string' && leaf.body.trim().length > 0,
            `leaf ${leaf.id} has empty body`
        );
    }
});

test('graphql/catalog: every body starts with query/mutation/subscription/{', () => {
    const leaves = collectLeaves(SALESFORCE_GRAPHQL_TEMPLATES);
    const allowed = /^(query|mutation|subscription|\{)/;
    for (const leaf of leaves) {
        const trimmed = leaf.body.trim();
        assert.match(
            trimmed,
            allowed,
            `leaf ${leaf.id} body does not start with query/mutation/subscription/{`
        );
    }
});

test('graphql/catalog: all ids (folders + leaves) are unique', () => {
    const ids = collectAllIds(SALESFORCE_GRAPHQL_TEMPLATES);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of ids) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
    }
    assert.equal(dupes.length, 0, `duplicate ids found: ${dupes.join(', ')}`);
});
