export * from './constants';
export * from './generateTitle';
export * from './models';
export * from './message';
export * from './providerRuntime';
export * from './skills';
export * from './runnerHelpers';

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
