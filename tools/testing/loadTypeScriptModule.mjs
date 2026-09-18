import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Execute the real module with explicit imports replaced by deterministic test boundaries. */
export function loadTypeScriptModule(url, imports, globals = {}) {
    const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
            esModuleInterop: true,
        },
    });
    const module = { exports: {} };
    vm.runInNewContext(
        outputText,
        {
            module,
            exports: module.exports,
            AbortController,
            AbortSignal,
            setTimeout,
            clearTimeout,
            console,
            Date,
            Map,
            Set,
            ...globals,
            require: name => {
                if (!(name in imports)) throw new Error(`Missing test boundary: ${name}`);
                return imports[name];
            },
        },
        { filename: String(url) }
    );
    return module.exports;
}
