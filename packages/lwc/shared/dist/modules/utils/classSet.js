/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
// Internal proto object. Methods assign back into `this` which at runtime is
// the ClassSet instance; we cast as `unknown as ClassSet` so the declaration
// doesn't require a mixed value/method index signature.
const proto = {
    add(className) {
        if (typeof className === 'string') {
            this[className] = true;
        }
        else {
            Object.assign(this, className);
        }
        return this;
    },
    invert() {
        Object.keys(this).forEach(key => {
            if (typeof this[key] === 'boolean') {
                this[key] = !this[key];
            }
        });
        return this;
    },
    toString() {
        return Object.keys(this)
            .filter(key => this[key] === true)
            .join(' ');
    },
};
export function classSet(config) {
    const initial = typeof config === 'string' ? { [config]: true } : config;
    return Object.assign(Object.create(proto), initial);
}
//# sourceMappingURL=classSet.js.map