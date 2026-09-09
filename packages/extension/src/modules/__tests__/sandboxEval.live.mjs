import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const EXT_ROOT = join(REPO_ROOT, 'dist/extension');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
};

const HARNESS = `<!doctype html>
<html>
  <body>
    <script type="module">
      async function waitReady(iframe) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('sandbox ready timeout')), 10000);
          const onMessage = (event) => {
            if (event.source !== iframe.contentWindow) return;
            if (event.data?.type !== 'SANDBOX_READY') return;
            window.removeEventListener('message', onMessage);
            clearTimeout(timer);
            resolve();
          };
          window.addEventListener('message', onMessage);
          iframe.addEventListener('load', () => {
            iframe.contentWindow.postMessage({ type: 'SANDBOX_PING' }, '*');
          });
        });
      }

      function collect(iframe, id) {
        return new Promise((resolve) => {
          const onMessage = (event) => {
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
      }

      function postEval(iframe, id, code) {
        iframe.contentWindow.postMessage(
          { type: 'EVAL_REQUEST', id, code, timeout: 8000 },
          '*'
        );
      }

      window.runLiveSandboxEval = async () => {
        const iframe = document.createElement('iframe');
        iframe.src = '/views/sandbox.html';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        await waitReady(iframe);

        const slowPending = collect(iframe, 'eval-slow');
        const fastPending = collect(iframe, 'eval-fast');
        postEval(
          iframe,
          'eval-slow',
          '(async () => { await new Promise(r => setTimeout(r, 400)); return "slow-ok"; })()'
        );
        postEval(iframe, 'eval-fast', 'return "fast-ok"');
        const [slow, fast] = await Promise.all([slowPending, fastPending]);

        const thirdPending = collect(iframe, 'eval-third');
        postEval(iframe, 'eval-third', 'return "third-ok"');
        const third = await thirdPending;
        return { slow, fast, third };
      };
    </script>
  </body>
</html>
`;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const server = createServer(async (req, res) => {
    try {
        if (req.url === '/' || req.url === '/harness.html') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(HARNESS);
            return;
        }
        const relative = decodeURIComponent((req.url || '/').split('?')[0]);
        const filePath = join(EXT_ROOT, relative);
        if (!filePath.startsWith(EXT_ROOT)) {
            res.writeHead(403);
            res.end('forbidden');
            return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
            'content-type': MIME[extname(filePath)] || 'application/octet-stream',
        });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end('not found');
    }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/harness.html`;

const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
});
const page = await browser.newPage();
page.on('pageerror', err => console.error('[pageerror]', err.message));
page.on('console', msg => {
    if (msg.type() === 'error') console.error('[console.error]', msg.text());
});

try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => window.runLiveSandboxEval());
    console.log(JSON.stringify(result, null, 2));

    assert(result.slow.hasError === false, `slow eval should succeed, got ${result.slow.output}`);
    assert(/slow-ok/.test(result.slow.output), `slow eval missing slow-ok: ${result.slow.output}`);
    assert(
        result.fast.hasError === true,
        `fast overlapping eval should error, got ${result.fast.output}`
    );
    assert(
        /Sandbox is busy with another eval/.test(result.fast.output),
        `fast eval should report busy, got ${result.fast.output}`
    );
    assert(result.third.hasError === false, `third eval should succeed after first finishes`);
    assert(
        /third-ok/.test(result.third.output),
        `third eval missing third-ok: ${result.third.output}`
    );
    console.log('LIVE SANDBOX EVAL: PASS');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
