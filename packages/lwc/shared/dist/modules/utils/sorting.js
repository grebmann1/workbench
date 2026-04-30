/**
 * Sorting utilities
 */
export function sortObjectsByField(objects, field, order) {
    // Define a map for storing the order of each element
    const orderMap = {};
    order.forEach((item, index) => {
        orderMap[String(item)] = index;
    });
    // Sort function
    return objects.sort((a, b) => {
        // Get the order index, default to a large number if the item is not in the order array
        const orderA = orderMap.hasOwnProperty(String(a[field])) ? orderMap[String(a[field])] : 999;
        const orderB = orderMap.hasOwnProperty(String(b[field])) ? orderMap[String(b[field])] : 999;
        // Compare the order indices
        return orderA - orderB;
    });
}
export function getCurrentRank(mapping, check) {
    for (let i = 0; i < mapping.length; i++) {
        if (check(mapping[i])) {
            return i;
        }
    }
    return mapping.length - 1;
}
//# sourceMappingURL=sorting.js.map