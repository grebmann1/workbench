class Logger {
    readonly isProduction =
        typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

    private readonly colors = {
        reset: '\x1b[0m',
        blue: '\x1b[34m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        red: '\x1b[31m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
    } as const;

    log(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(...args);
        }
    }

    info(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.blue}INFO:`, ...args);
        }
    }

    success(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.green}SUCCESS:`, ...args);
        }
    }

    agent(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.cyan}[AGENT]:`, ...args);
        }
    }

    warn(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.yellow}WARNING:`, ...args);
        }
    }

    error(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.red}ERROR:`, ...args);
        }
    }

    debug(...args: unknown[]) {
        if (!this.isProduction) {
            console.log(`${this.colors.magenta}DEBUG:`, ...args);
        }
    }
}

export default new Logger();
