/**
 * DOM manipulation utilities
 */
export function enableBodyScroll() {
    const body = document.querySelector('body');
    if (body) {
        body.style.overflow = '';
    }
}
export function disableBodyScroll() {
    const body = document.querySelector('body');
    if (body) {
        body.style.overflow = 'hidden';
    }
}
export function timeout(interval) {
    return new Promise(resolve => {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(resolve, interval);
    });
}
export function animationFrame() {
    return new Promise(resolve => {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        window.requestAnimationFrame(resolve);
    });
}
//# sourceMappingURL=dom.js.map