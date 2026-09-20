import type { TourSlideId } from '../product-tour/slides.ts';

export const FILM_WIDTH = 1920;
export const FILM_HEIGHT = 1080;
export const FILM_DURATION = 78;

export interface FilmChapter {
    id: 'intro' | TourSlideId | 'outro';
    start: number;
    end: number;
    label: string;
    title: string;
    detail: string;
    accent: string;
    steps: readonly string[];
    captions: readonly string[];
}

export const CHAPTERS: readonly FilmChapter[] = [
    {
        id: 'intro',
        start: 0,
        end: 7,
        label: 'Meet Workbench 2.0',
        title: 'Less switching.\nMore building.',
        detail: 'A few of the things you can do with your Salesforce toolkit.',
        accent: '#1b96ff',
        steps: [],
        captions: [
            'Meet Workbench 2.0. Here are just a few of its capabilities for your everyday Salesforce work.',
        ],
    },
    {
        id: 'overlay',
        start: 7,
        end: 18,
        label: 'Stay in context',
        title: 'Your tools. One click away.',
        detail: 'The overlay lives inside your Salesforce pages.',
        accent: '#1b96ff',
        steps: ['Open the overlay', 'Find an object', 'Keep your context'],
        captions: [
            'Open Workbench directly from the Salesforce page you are working on.',
            'Search for Account to bring your org tools and object shortcuts into reach.',
            'Keep the record in view while you find what you need.',
        ],
    },
    {
        id: 'soql',
        start: 18,
        end: 30,
        label: 'Work with your data',
        title: 'From question to query.',
        detail: 'Write SOQL. Run it. Explore the results.',
        accent: '#1b96ff',
        steps: ['Write your SOQL', 'Run the query', 'Read the results'],
        captions: [
            'Open SOQL Explorer and write a query against your Salesforce org.',
            'Select the account ID, name, and industry, then run the query.',
            'Review the returned records in a table, alongside your query.',
        ],
    },
    {
        id: 'workbench',
        start: 30,
        end: 41,
        label: 'Understand your org',
        title: 'See what your org is made of.',
        detail: 'Objects, fields, and metadata in one workspace.',
        accent: '#1b96ff',
        steps: ['Browse metadata', 'Filter by name', 'Inspect a component'],
        captions: [
            'Open Metadata Explorer to browse the components in your org.',
            'Filter the component tree to find the Account object.',
            'Select it to explore the metadata tree, fields, and JSON in Workbench.',
        ],
    },
    {
        id: 'editor',
        start: 41,
        end: 54,
        label: 'Build in the browser',
        title: 'An idea. A component. Built.',
        detail: 'A familiar code editor, inside your browser.',
        accent: '#1b96ff',
        steps: ['Open the command palette', 'Create an LWC', 'Write the template'],
        captions: [
            'Open the browser code editor and choose Create Lightning Web Component.',
            'Name the component accountHighlight to create its bundle.',
            'Write the HTML template with your project files close at hand.',
        ],
    },
    {
        id: 'agent',
        start: 54,
        end: 68,
        label: 'Let AI lend a hand',
        title: 'Ask. Then watch it work.',
        detail: 'An AI agent that can take action in your browser.',
        accent: '#1b96ff',
        steps: ['Describe the task', 'Watch the agent act', 'Review the result'],
        captions: [
            'Ask the AI agent to fill a support form using the details you provide.',
            'The agent enters the name, email, order number, and message on the page.',
            'Follow its actions in the side panel and review the completed task.',
        ],
    },
    {
        id: 'outro',
        start: 68,
        end: 78,
        label: 'Explore more with Workbench 2.0',
        title: 'Workbench 2.0.\nSo much more to explore.',
        detail: 'These are just a few of Workbench 2.0’s capabilities.',
        accent: '#1b96ff',
        steps: [],
        captions: [
            'These are just a few of Workbench 2.0’s capabilities. Add the extension to explore more.',
        ],
    },
];

export function clamp(value: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, value));
}

export function ease(value: number): number {
    const x = clamp(value);
    return x * x * (3 - 2 * x);
}

export function chapterAt(seconds: number): FilmChapter {
    return CHAPTERS.find(chapter => seconds < chapter.end) ?? CHAPTERS[CHAPTERS.length - 1];
}

export function captionIndex(chapter: FilmChapter, seconds: number): number {
    return Math.min(
        chapter.captions.length - 1,
        Math.floor(
            clamp((seconds - chapter.start) / (chapter.end - chapter.start)) *
                chapter.captions.length
        )
    );
}

export function timestamp(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;
}
