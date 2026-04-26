/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

type ClassSetValue = Record<string, boolean>;

/**
 * A ClassSet is a mutable bag of `className -> boolean` pairs with a few
 * helper methods. Keeping the shape loose with an index signature lets us
 * both call `set.add(...)` and also read arbitrary class flags with
 * `set[className]`.
 */
type ClassSet = ClassSetValue & {
    add: (className: string | ClassSetValue) => ClassSet;
    invert: () => ClassSet;
    toString: () => string;
};

// Internal proto object. Methods assign back into `this` which at runtime is
// the ClassSet instance; we cast as `unknown as ClassSet` so the declaration
// doesn't require a mixed value/method index signature.
const proto = {
    add(this: ClassSet, className: string | ClassSetValue) {
        if (typeof className === 'string') {
            this[className] = true;
        } else {
            Object.assign(this, className);
        }
        return this;
    },
    invert(this: ClassSet) {
        Object.keys(this).forEach(key => {
            if (typeof this[key] === 'boolean') {
                this[key] = !this[key];
            }
        });
        return this;
    },
    toString(this: ClassSet) {
        return Object.keys(this)
            .filter(key => this[key] === true)
            .join(' ');
    },
};

export function classSet(config: string | ClassSetValue): ClassSet {
    const initial: ClassSetValue = typeof config === 'string' ? { [config]: true } : config;
    return Object.assign(Object.create(proto), initial) as ClassSet;
}
