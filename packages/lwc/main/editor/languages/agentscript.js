import { isMonacoLanguageSetup } from 'shared/utils';

export function configureAgentScriptLanguage(monaco) {
    if (isMonacoLanguageSetup('agentscript')) return;
    monaco.languages.register({
        id: 'agentscript',
        extensions: ['.agentscript', '.agent'],
    });
    monaco.languages.setLanguageConfiguration('agentscript', languageConfiguration);
    monaco.languages.setMonarchTokensProvider('agentscript', language);
}

export const languageConfiguration = {
    comments: {
        lineComment: '#',
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
    ],
    folding: {
        markers: {
            start: /^\s*(topic|action|if|start_agent|config|system)\b/,
            end: /^\s*end\b/,
        },
    },
};

export const language = {
    defaultToken: '',
    tokenPostfix: '.agentscript',
    ignoreCase: false,

    brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    keywords: [
        'config',
        'system',
        'topic',
        'start_agent',
        'action',
        'set',
        'run',
        'with',
        'if',
        'else',
        'end',
        'return',
        'emit',
    ],

    typeKeywords: ['string', 'number', 'boolean', 'list', 'map'],

    operators: ['=', '==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/'],

    tokenizer: {
        root: [
            { include: '@whitespace' },
            { include: '@comments' },
            { include: '@templateStrings' },
            { include: '@numbers' },
            { include: '@strings' },
            { include: '@variables' },
            [/[{}[\]()]/, '@brackets'],
            [/[;,.]/, 'delimiter'],
            [
                /[a-zA-Z_]\w*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@typeKeywords': 'type',
                        '@default': 'identifier',
                    },
                },
            ],
            [/[=!<>]=?|[+\-*/]/, 'operator'],
        ],

        whitespace: [[/\s+/, 'white']],

        comments: [[/#.*$/, 'comment']],

        templateStrings: [[/^\s*\|.*$/, 'string']],

        numbers: [
            [/\d+\.\d+/, 'number.float'],
            [/\d+/, 'number'],
        ],

        strings: [
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string', next: '@stringDouble' }],
            [/'/, { token: 'string', next: '@stringSingle' }],
        ],

        stringDouble: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, { token: 'string', next: '@pop' }],
        ],

        stringSingle: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape'],
            [/'/, { token: 'string', next: '@pop' }],
        ],

        variables: [[/@[a-zA-Z_][\w.]*/, 'variable']],
    },
};
