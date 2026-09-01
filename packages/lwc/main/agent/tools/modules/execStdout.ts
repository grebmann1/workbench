/**
 * Normalizes stdout returned by just-bash's `exec` for display / model-facing text.
 *
 * just-bash commands that emit raw bytes (cat, gzip, …) return `stdout` as a
 * binary string — one char per byte — and set `stdoutEncoding: "binary"` so the
 * redirect system copies bytes verbatim (see just-bash types.d.ts). When we
 * surface that stdout as display text we must first decode those bytes back
 * through UTF-8; otherwise multi-byte characters (emoji, em dashes) render as
 * Latin-1 mojibake, which compounds on every re-read. Non-UTF-8 bytes decode to
 * U+FFFD, which is the correct fallback for display of genuinely binary output.
 */
export function decodeExecStdout(res: { stdout?: string; stdoutEncoding?: string }): string {
    const stdout = res?.stdout || '';
    if (res?.stdoutEncoding !== 'binary' || !stdout) return stdout;
    const bytes = new Uint8Array(stdout.length);
    for (let i = 0; i < stdout.length; i += 1) {
        bytes[i] = stdout.charCodeAt(i) & 0xff;
    }
    return new TextDecoder('utf-8').decode(bytes);
}
