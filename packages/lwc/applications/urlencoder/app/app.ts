import { track } from 'lwc';
import ToolkitElement from 'host-api/element';
import { reportError } from 'host-api/store';

type Mode = 'encode' | 'decode';

const MODE_OPTIONS = [
    { label: 'Encode', value: 'encode' },
    { label: 'Decode', value: 'decode' },
];

export default class App extends ToolkitElement {
    @track input = '';
    @track output = '';
    @track mode: Mode = 'encode';

    modeOptions = MODE_OPTIONS;

    get isCopyDisabled(): boolean {
        return this.output.length === 0;
    }

    get showEmptyState(): boolean {
        return !this.input && !this.output;
    }

    handleInputChange = (event: Event): void => {
        this.input = (event.target as HTMLTextAreaElement).value ?? '';
    };

    handleModeChange = (event: Event): void => {
        this.mode = (event.target as HTMLInputElement).value as Mode;
        this.run();
    };

    handleRun = (): void => {
        this.run();
    };

    handleCopy = async (): Promise<void> => {
        if (!this.output) return;
        await navigator.clipboard.writeText(this.output);
    };

    handleClear = (): void => {
        this.input = '';
        this.output = '';
    };

    run(): void {
        try {
            this.output =
                this.mode === 'encode'
                    ? encodeURIComponent(this.input)
                    : decodeURIComponent(this.input);
        } catch (err) {
            this.output = '';
            reportError(err instanceof Error ? err : String(err), { source: 'urlencoder' });
        }
    }
}
