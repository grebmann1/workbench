import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const destination = new URL('apps/ui/src/product-tour/assets/', root);
const icons = {
    utility: [
        'add',
        'attach',
        'back',
        'bug',
        'check',
        'chevrondown',
        'chevronright',
        'close',
        'copy',
        'database',
        'delete',
        'download',
        'edit',
        'einstein',
        'expand_alt',
        'filterList',
        'forward',
        'home',
        'info',
        'list',
        'logout',
        'new_window',
        'refresh',
        'search',
        'send',
        'settings',
        'setup',
        'share',
        'side_list',
        'stop',
        'table',
        'toggle_panel_left',
        'toggle_panel_right',
        'user',
        'world',
    ],
    standard: ['account', 'bundle_config', 'dataset'],
};
const symbols = [];
for (const [group, names] of Object.entries(icons)) {
    const source = await readFile(
        new URL(
            `node_modules/@salesforce-ux/design-system/assets/icons/${group}-sprite/svg/symbols.svg`,
            root
        ),
        'utf8'
    );
    for (const name of names) {
        const match = source.match(
            new RegExp(`<symbol\\b[^>]*\\bid="${name}"[^>]*>[\\s\\S]*?<\\/symbol>`)
        );
        if (!match) throw new Error(`Missing canonical SLDS icon: ${group}:${name}`);
        symbols.push(match[0].replace(`id="${name}"`, `id="${group}-${name}"`));
    }
}
await mkdir(destination, { recursive: true });
await writeFile(
    new URL('app-icons.svg', destination),
    `<!-- Extracted from the repository's installed Salesforce Lightning Design System. Run tools/product-film/sync-preview-assets.mjs to refresh. -->\n<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('\n')}</svg>\n`
);
const template = await readFile(
    new URL('packages/lwc/main/component/illustration/empty/empty.html', root),
    'utf8'
);
const illustration = template.match(/<svg[\s\S]*?<\/svg>/)?.[0];
if (!illustration) throw new Error('Could not extract the actual empty-state illustration.');
const colors = {
    'stroke-primary': 'stroke="#90d0fe"',
    'stroke-secondary': 'stroke="#cfe9fe"',
    'fill-primary': 'fill="#90d0fe"',
    'fill-secondary': 'fill="#cfe9fe"',
};
await writeFile(
    new URL('empty-state.svg', destination),
    illustration.replace(
        /class="slds-illustration__(stroke-primary|stroke-secondary|fill-primary|fill-secondary)"/g,
        (_, name) => colors[name]
    )
);
console.log(
    `Synced ${symbols.length} real SLDS icons and the Workbench empty-state illustration to ${fileURLToPath(destination)}`
);
