import { isMonacoLanguageSetup } from 'shared/utils';

export function configureGraphqlLanguage(monaco) {
    if (isMonacoLanguageSetup('graphql')) return;
    monaco.languages.register({ id: 'graphql' });
    monaco.languages.setLanguageConfiguration('graphql', languageConfiguration);
    monaco.languages.setMonarchTokensProvider('graphql', language);
}

export const languageConfiguration = {
    comments: { lineComment: '#' },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: '"""', close: '"""' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
    ],
};

export const language = {
    defaultToken: '',
    tokenPostfix: '.graphql',

    keywords: [
        'query',
        'mutation',
        'subscription',
        'fragment',
        'on',
        'true',
        'false',
        'null',
        'enum',
        'type',
        'input',
        'interface',
        'union',
        'scalar',
        'schema',
        'extend',
        'implements',
        'directive',
        'repeatable',
    ],

    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    tokenizer: {
        root: [
            [/#.*$/, 'comment'],
            { include: '@whitespace' },
            { include: '@strings' },
            [/[{}()\[\]]/, '@brackets'],
            [/[,;:!=|&]/, 'delimiter'],
            [/\$[A-Za-z_][A-Za-z0-9_]*/, 'variable'],
            [/@[A-Za-z_][A-Za-z0-9_]*/, 'annotation'],
            [
                /[A-Za-z_][A-Za-z0-9_]*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],
            [/-?\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
            [/-?\d+/, 'number'],
        ],
        whitespace: [[/\s+/, 'white']],
        strings: [
            [/"""/, { token: 'string.quote', next: '@blockString' }],
            [/"/, { token: 'string.quote', next: '@string' }],
        ],
        string: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, { token: 'string.quote', next: '@pop' }],
        ],
        blockString: [
            [/[^"]+/, 'string'],
            [/"""/, { token: 'string.quote', next: '@pop' }],
            [/"/, 'string'],
        ],
    },
};
