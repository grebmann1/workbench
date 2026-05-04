import { LightningElement, api } from 'lwc';
// @ts-ignore - module alias resolved by rollup at build time
import { SALESFORCE_GRAPHQL_TEMPLATES } from 'graphql/templates';

type SldsTreeNode = {
    id: string;
    name: string;
    title: string;
    icon: string;
    keywords?: string[];
    children?: SldsTreeNode[];
    extra?: { template: { body: string; variables?: string; name: string } };
};

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

function isFolder(node: GraphqlTemplate | GraphqlTemplateFolder): node is GraphqlTemplateFolder {
    return Array.isArray((node as GraphqlTemplateFolder).children);
}

function toTreeNode(node: GraphqlTemplate | GraphqlTemplateFolder): SldsTreeNode {
    if (isFolder(node)) {
        return {
            id: node.id,
            name: node.name,
            title: node.name,
            icon: node.icon,
            children: node.children.map(toTreeNode),
        };
    }
    return {
        id: node.id,
        name: node.name,
        title: node.title || node.name,
        icon: node.icon,
        keywords: [node.name, node.title].filter(Boolean),
        extra: {
            template: {
                body: node.body,
                variables: node.variables,
                name: node.name,
            },
        },
    };
}

/**
 * Static catalog of curated Salesforce GraphQL queries. Mirrors the visual +
 * event contract of `api/catalogPanel/` — dispatches a bubbling `select`
 * CustomEvent whose `detail` carries `{ body, variables, name }` when the
 * user clicks a leaf.
 */
export default class CatalogPanel extends LightningElement {
    @api isOpen = false;
    @api size: string = 'slds-size_medium';
    @api title: string = 'Salesforce GraphQL Catalog';

    searchFields = ['name', 'title', 'keywords'];
    minSearchLength = 1;

    get tree(): SldsTreeNode[] {
        // The top-level folder is the catalog root — expose its children as
        // top-level tree entries, matching the api catalog's shape.
        return SALESFORCE_GRAPHQL_TEMPLATES.children.map(toTreeNode);
    }

    handleSelect(event: CustomEvent): void {
        const item = event.detail?.item;
        if (!item || Array.isArray(item.children)) return;
        const template = item.extra?.template;
        if (!template) return;

        this.dispatchEvent(
            new CustomEvent('select', {
                bubbles: true,
                composed: true,
                detail: {
                    body: template.body,
                    variables: template.variables,
                    name: template.name,
                },
            })
        );
    }

    handleClose(event: CustomEvent): void {
        this.dispatchEvent(new CustomEvent('close', { detail: event.detail }));
    }
}
