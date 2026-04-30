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
        setTimeout(resolve, interval);
    });
}
export function animationFrame() {
    return new Promise(resolve => {
        window.requestAnimationFrame(resolve);
    });
}
//# sourceMappingURL=dom.js.map