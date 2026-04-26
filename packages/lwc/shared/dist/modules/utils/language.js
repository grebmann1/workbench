/**
 * Language/file type utilities
 */
const languageMapping = {
    css: 'css',
    scss: 'scss',
    js: 'javascript',
    json: 'json',
    md: 'markdown',
    ts: 'typescript',
    txt: 'text',
    apex: 'apex', // We map apex to JAVA,
    cls: 'apex', // We map cls to JAVA
    xml: 'xml',
    design: 'xml', // We map cls to xml
    trigger: 'apex',
    html: 'html',
    page: 'html',
    auradoc: 'html',
    cmp: 'html',
    png: 'png',
    svg: 'xml',
};
export function getLanguage(extension) {
    if (extension == null)
        return null;
    return Object.prototype.hasOwnProperty.call(languageMapping, extension)
        ? languageMapping[extension]
        : null;
}
export function formatFiles(files, defaultLanguage) {
    return Array.from(files).map(file => {
        const name = file?.name;
        const extension = name && name.includes('.') ? name.split('.').pop() || null : null;
        return {
            ...file,
            extension, // we remove the '.' for the editor
            language: getLanguage(extension) || defaultLanguage,
        };
    });
}
//# sourceMappingURL=language.js.map