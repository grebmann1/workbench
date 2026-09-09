import { test, expect } from './fixtures';

type EvalResult = { id: string; output: string; hasError: boolean };

test.describe('@extension sandbox eval', () => {
    test('concurrent EVAL_REQUEST keeps the in-flight result and rejects the overlapping eval', async ({
        context,
        extensionId,
    }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/views/app.html`);

        const { slow, fast, third } = await page.evaluate(async () => {
            const iframe = document.createElement('iframe');
            iframe.src = chrome.runtime.getURL('views/sandbox.html');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            await new Promise<void>((resolve, reject) => {
                const timer = window.setTimeout(
                    () => reject(new Error('sandbox ready timeout')),
                    10_000
                );
                const onMessage = (event: MessageEvent) => {
                    if (event.source !== iframe.contentWindow) return;
                    if (event.data?.type !== 'SANDBOX_READY') return;
                    window.removeEventListener('message', onMessage);
                    window.clearTimeout(timer);
                    resolve();
                };
                window.addEventListener('message', onMessage);
                iframe.addEventListener('load', () => {
                    iframe.contentWindow?.postMessage({ type: 'SANDBOX_PING' }, '*');
                });
            });

            const collect = (id: string) =>
                new Promise<EvalResult>(resolve => {
                    const onMessage = (event: MessageEvent) => {
                        if (event.source !== iframe.contentWindow) return;
                        if (event.data?.type !== 'EVAL_RESULT' || event.data.id !== id) return;
                        window.removeEventListener('message', onMessage);
                        resolve({
                            id: event.data.id,
                            output: String(event.data.output || ''),
                            hasError: Boolean(event.data.hasError),
                        });
                    };
                    window.addEventListener('message', onMessage);
                });

            const postEval = (id: string, code: string) => {
                iframe.contentWindow?.postMessage(
                    { type: 'EVAL_REQUEST', id, code, timeout: 8_000 },
                    '*'
                );
            };

            const slowPending = collect('eval-slow');
            const fastPending = collect('eval-fast');
            postEval(
                'eval-slow',
                '(async () => { await new Promise(r => setTimeout(r, 400)); return "slow-ok"; })()'
            );
            postEval('eval-fast', 'return "fast-ok"');
            const [slow, fast] = await Promise.all([slowPending, fastPending]);

            const thirdPending = collect('eval-third');
            postEval('eval-third', 'return "third-ok"');
            const third = await thirdPending;
            return { slow, fast, third };
        });

        expect(slow.hasError).toBe(false);
        expect(slow.output).toMatch(/slow-ok/);
        expect(fast.hasError).toBe(true);
        expect(fast.output).toMatch(/Sandbox is busy with another eval/);
        expect(third.hasError).toBe(false);
        expect(third.output).toMatch(/third-ok/);
    });

    test('queued execInSandbox runs overlapping js evals in order without dropping results', async ({
        appPage,
    }) => {
        const page = await appPage('urlencoder');
        const hasSmoke = await page.evaluate(
            () =>
                typeof (window as Window & { runSandboxEvalSmokeTest?: unknown })
                    .runSandboxEvalSmokeTest === 'function'
        );
        test.skip(
            !hasSmoke,
            'runSandboxEvalSmokeTest is not on window; CdpHandler queue is covered by unit tests'
        );

        const warmup = await page.evaluate(async () => {
            return window.runSandboxEvalSmokeTest({ code: 'return "warmup"', timeoutMs: 8_000 });
        });
        expect(warmup.hasError).toBe(false);
        expect(String(warmup.output || '')).toMatch(/warmup/);

        const [slow, fast] = await page.evaluate(async () => {
            return Promise.all([
                window.runSandboxEvalSmokeTest({
                    code: '(async () => { await new Promise(r => setTimeout(r, 400)); return "queued-slow"; })()',
                    timeoutMs: 8_000,
                }),
                window.runSandboxEvalSmokeTest({
                    code: 'return "queued-fast"',
                    timeoutMs: 8_000,
                }),
            ]);
        });

        expect(slow.hasError).toBe(false);
        expect(String(slow.output || '')).toMatch(/queued-slow/);
        expect(fast.hasError).toBe(false);
        expect(String(fast.output || '')).toMatch(/queued-fast/);
    });
});
