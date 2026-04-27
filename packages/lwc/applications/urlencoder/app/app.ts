import { track } from 'lwc';
import ToolkitElement from 'host-api/element';

type Mode = 'encode' | 'decode';

const MODE_OPTIONS = [
    { label: 'Encode', value: 'encode' },
    { label: 'Decode', value: 'decode' },
];

export default class App extends ToolkitElement {
    @track input = '';
    @track output = '';
    @track mode: Mode = 'encode';
    @track errorMessage = '';

    modeOptions = MODE_OPTIONS;

    get hasError(): boolean {
        return this.errorMessage.length > 0;
    }

    get isCopyDisabled(): boolean {
        return this.output.length === 0;
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
        this.errorMessage = '';
    };

    run(): void {
        this.errorMessage = '';
        try {
            this.output =
                this.mode === 'encode'
                    ? encodeURIComponent(this.input)
                    : decodeURIComponent(this.input);
        } catch (err) {
            this.output = '';
            this.errorMessage = err instanceof Error ? err.message : String(err);
        }
    }
}
