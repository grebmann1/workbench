/** Read a File into a serializable shape for the agent. Kept in its own module (not inline in the
 *  utils barrel) so unit tests can import it without pulling the whole `agent/utils` graph — the
 *  barrel transitively reaches core/store -> agent/Agent -> googleAuth (LWC decorators), which the
 *  --experimental-strip-types test loader can't parse. */
export const readFileContent = (file: File) => {
    return new Promise(resolve => {
        if (file.size > 20 * 1024 * 1024) {
            // 20MB limit
            resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                content: null,
                note: 'File too large to include content.',
            });
        } else if (file.type.startsWith('text/') || file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = e =>
                resolve({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: e.target.result,
                });
            reader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = e =>
                resolve({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: e.target.result,
                });
            reader.readAsDataURL(file);
        }
    });
};
