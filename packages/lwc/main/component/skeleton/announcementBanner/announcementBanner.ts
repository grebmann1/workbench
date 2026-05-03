import {
    fetchRemoteAnnouncement,
    isAnnouncementDismissed,
    markAnnouncementDismissed,
    type RemoteAnnouncement,
} from 'core/announcements';
import { announce } from 'host-api/announce';
import { LightningElement } from 'lwc';

export default class AnnouncementBanner extends LightningElement {
    announcement: RemoteAnnouncement | null = null;

    connectedCallback() {
        void this.loadAnnouncement();
    }

    async loadAnnouncement() {
        const announcement = await fetchRemoteAnnouncement();
        if (!announcement || (await isAnnouncementDismissed(announcement.id))) {
            return;
        }

        this.announcement = announcement;
        // Make the banner perceivable to screen readers even though the
        // visual treatment is polite — use assertive for error variants so
        // they interrupt whatever the reader is speaking.
        const severity = (announcement.variant || 'info').toLowerCase();
        const parts = [announcement.title, announcement.message].filter(Boolean);
        const spoken = parts.join(' — ');
        if (spoken) {
            announce(spoken, { assertive: severity === 'error' });
        }
    }

    handleClose = () => {
        const announcementId = this.announcement?.id;
        this.announcement = null;
        if (announcementId) {
            void markAnnouncementDismissed(announcementId);
        }
    };

    get hasAnnouncement() {
        return !!this.announcement;
    }

    get hasTitle() {
        return !!this.announcement?.title;
    }

    get hasLink() {
        return !!this.announcement?.linkUrl;
    }

    get variant() {
        return this.announcement?.variant || 'info';
    }

    get title() {
        return this.announcement?.title || '';
    }

    get message() {
        return this.announcement?.message || '';
    }

    get linkLabel() {
        return this.announcement?.linkLabel || this.announcement?.linkUrl || '';
    }

    get linkUrl() {
        return this.announcement?.linkUrl || '';
    }
}
