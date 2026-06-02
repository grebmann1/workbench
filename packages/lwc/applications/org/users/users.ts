import ToolkitElement from 'host-api/element';
import { api } from 'lwc';
import { store as legacyStore, store_application } from 'shared/store';
import { shortFormatter } from 'shared/utils';

const formatCount = (value: unknown): string => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
};

const formatCompact = (value: unknown): string => {
    const n = Number(value);
    return Number.isFinite(n) ? shortFormatter.format(n) : '0';
};

const INTERNAL_USER_TYPES = new Set(['Standard', 'CsnOnly']);
const isInternalUserType = (userType: unknown): boolean =>
    typeof userType === 'string' && INTERNAL_USER_TYPES.has(userType);

export default class Users extends ToolkitElement {
    @api isInjected = false;

    total_users;
    total_active;
    total_inactive;

    total_active_30days;

    total_internal = 0;
    total_external = 0;

    connectedCallback() {
        this.init();
    }

    /** Events */

    goToUrl = e => {
        const redirectUrl = e.currentTarget.dataset.url;
        legacyStore.dispatch(store_application.navigate(redirectUrl));
    };

    /** methods */

    init = async () => {
        await this.load_userInformations();
    };

    load_userInformations = async () => {
        const responses = await Promise.all([
            this.connector.conn.query(
                'SELECT Count(Id) total,IsActive FROM User GROUP BY IsActive'
            ),
            this.connector.conn.query(
                'SELECT Count(Id) total FROM User WHERE CreatedDate = LAST_N_DAYS:30 AND IsActive = true'
            ),
            this.connector.conn
                .query('SELECT Count(Id) total,UserType FROM User GROUP BY UserType')
                .catch(() => null),
        ]);

        this.total_users = responses[0].records.reduce((total, x) => x.total + total, 0);
        this.total_active = responses[0].records.find(x => x.IsActive)?.total || 0;
        this.total_inactive = responses[0].records.find(x => !x.IsActive)?.total || 0;
        this.total_active_30days = responses[1].records[0]?.total || 0;

        const userTypeRecords = responses[2]?.records ?? [];
        let internal = 0;
        let external = 0;
        for (const record of userTypeRecords) {
            const count = Number(record.total) || 0;
            if (isInternalUserType(record.UserType)) {
                internal += count;
            } else {
                external += count;
            }
        }
        this.total_internal = internal;
        this.total_external = external;
    };

    get activityRate() {
        if (!this.total_users) {
            return 0;
        }

        return Math.round((this.total_active / this.total_users) * 100);
    }

    get activityRateLabel() {
        return `${this.activityRate}% active`;
    }

    get growthLabel() {
        return `+${formatCompact(this.total_active_30days)} recent`;
    }

    get internalLabel() {
        return `${formatCompact(this.total_internal)} internal`;
    }

    get externalLabel() {
        return `${formatCompact(this.total_external)} external`;
    }

    get hasUserTypeBreakdown() {
        return this.total_internal > 0 || this.total_external > 0;
    }

    get summaryHeadline() {
        if (!this.total_users) {
            return 'No users found';
        }

        return `${formatCount(this.total_users)} users, ${this.activityRate}% active`;
    }

    get summaryDescription() {
        return `${formatCount(this.total_active)} active users, ${formatCount(this.total_inactive)} inactive accounts, and ${formatCount(this.total_active_30days)} active users created in the last 30 days.`;
    }
}
