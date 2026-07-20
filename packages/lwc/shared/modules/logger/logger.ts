// NOTE: reference the bare `process.env.NODE_ENV` token (no optional chaining)
// so the bundler's `replace` plugin can statically inline it to a string
// literal at build time. Optional chaining (`process.env?.NODE_ENV`) breaks
// that literal match, leaving `process` referenced at runtime — where it is
// undefined in the browser extension, so the whole guard collapsed to `false`
// and every log printed in production. The try/catch keeps us safe in any
// environment where the token was not replaced and `process` is undefined.
const resolveIsProduction = (): boolean => {
    try {
        // Non-null assertion is erased by tsc, so emitted JS keeps the clean
        // `process.env.NODE_ENV` literal the bundler's replace plugin matches.
        return process.env!.NODE_ENV === 'production';
    } catch {
        return false;
    }
};

class Logger {
    readonly isProduction = resolveIsProduction();

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
