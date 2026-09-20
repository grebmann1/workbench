/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

type OverflowItem = {
    width?: number;
    value: string | number;
};

type OverflowParams<T extends OverflowItem> = {
    items: T[];
    activeItem?: T;
    containerWidth: number;
    overflowWidth: number;
};

export function calculateOverflow<T extends OverflowItem>({
    items,
    activeItem,
    containerWidth,
    overflowWidth,
}: OverflowParams<T>): { visibleItems: T[]; overflowItems: T[] } {
    const visibleItems: T[] = [];
    const overflowItems: T[] = [];
    const itemsLength = items.length;

    const allItemsWidth = items.reduce((totalWidth, item) => totalWidth + (item.width || 0), 0);

    if (allItemsWidth <= containerWidth || containerWidth <= 0) {
        return { visibleItems: items, overflowItems };
    }

    let totalWidth = overflowWidth;

    if (activeItem) {
        totalWidth += activeItem.width || 0;
    }

    let activeItemFitsWithoutRearrangement = false;

    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        if (activeItem && activeItem.value === item.value) {
            activeItemFitsWithoutRearrangement = overflowItems.length === 0;
            if (activeItemFitsWithoutRearrangement) {
                visibleItems.push(activeItem);
            }
        } else {
            const itemFits = (item.width || 0) + totalWidth <= containerWidth;
            if (itemFits && overflowItems.length === 0) {
                totalWidth += item.width || 0;
                visibleItems.push(item);
            } else {
                overflowItems.push(item);
            }
        }
    }

    if (!activeItemFitsWithoutRearrangement && activeItem) {
        visibleItems.push(activeItem);
    }

    return {
        visibleItems,
        overflowItems,
    };
}
