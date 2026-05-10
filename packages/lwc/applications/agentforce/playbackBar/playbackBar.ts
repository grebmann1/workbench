import { api } from 'lwc';
import ToolkitElement from 'host-api/element';

export default class PlaybackBar extends ToolkitElement {
    @api currentIndex: number = -1;
    @api totalSteps: number = 0;
    @api isPlaying: boolean = false;
    @api speed: number = 1500;

    get stepLabel(): string {
        if (this.currentIndex < 0) return '—';
        return `Step ${this.currentIndex + 1} of ${this.totalSteps}`;
    }

    get isPrevDisabled(): boolean {
        return this.currentIndex <= 0;
    }

    get isNextDisabled(): boolean {
        return this.currentIndex >= this.totalSteps - 1;
    }

    get playLabel(): string {
        return this.isPlaying ? '⏸ Pause' : '▶ Play';
    }

    get speedClass05(): string {
        return this.speed === 3000 ? 'speed-pill is-active' : 'speed-pill';
    }

    get speedClass10(): string {
        return this.speed === 1500 ? 'speed-pill is-active' : 'speed-pill';
    }

    get speedClass20(): string {
        return this.speed === 750 ? 'speed-pill is-active' : 'speed-pill';
    }

    handlePrev() {
        this.dispatchEvent(new CustomEvent('prev'));
    }

    handleNext() {
        this.dispatchEvent(new CustomEvent('next'));
    }

    handleTogglePlay() {
        this.dispatchEvent(new CustomEvent('toggleplay'));
    }

    handleSpeed05() {
        this.dispatchEvent(new CustomEvent('speedchange', { detail: { speed: 3000 } }));
    }

    handleSpeed10() {
        this.dispatchEvent(new CustomEvent('speedchange', { detail: { speed: 1500 } }));
    }

    handleSpeed20() {
        this.dispatchEvent(new CustomEvent('speedchange', { detail: { speed: 750 } }));
    }
}
