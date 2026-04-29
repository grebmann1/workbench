/**
 * DOM manipulation utilities
 */

export function enableBodyScroll(): void {
    const body = document.querySelector('body');
    if (body) {
        body.style.overflow = '';
    }
}

export function disableBodyScroll(): void {
    const body = document.querySelector('body');
    if (body) {
        body.style.overflow = 'hidden';
    }
}

export function timeout(interval: number) {
    return new Promise<void>(resolve => {
        setTimeout(resolve, interval);
    });
}

export function animationFrame() {
    return new Promise<number>(resolve => {
        window.requestAnimationFrame(resolve);
    });
}
