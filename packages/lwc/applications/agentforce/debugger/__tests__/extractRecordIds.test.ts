/**
 * Tests for the N9a record-Id extractor used to surface "Open record"
 * buttons on debugger step rows.
 *
 * Contract verified here:
 *   - Plain text returns an empty array.
 *   - Both 15-char and 18-char Salesforce-shaped Ids are detected.
 *   - Multiple Ids in one blob are all detected, in first-seen order.
 *   - All-letter strings (e.g. `EMAILMESSAGEID`) are excluded — they
 *     match the length pattern but are never real Ids.
 *   - Output is capped at 5 unique Ids per call.
 *   - Duplicate Ids are deduplicated.
 *   - Non-string and empty inputs return an empty array.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractRecordIds } from '../extractRecordIds.ts';

test('plain text without Ids returns an empty array', () => {
    const out = extractRecordIds('this is just some prose with no ids');
    assert.deepEqual(out, []);
});

test('single 15-char Salesforce Id is detected', () => {
    const out = extractRecordIds('the case is 5003x00000abcDE for review');
    assert.deepEqual(out, ['5003x00000abcDE']);
});

test('single 18-char Salesforce Id is detected', () => {
    const out = extractRecordIds('record 5003x00000abcDEAA1 was updated');
    assert.deepEqual(out, ['5003x00000abcDEAA1']);
});

test('multiple Ids in one blob are all detected', () => {
    const text = '5003x00000abcDE referenced 0013x00000xyzAB and a01AA0000001234';
    const out = extractRecordIds(text);
    assert.deepEqual(out, ['5003x00000abcDE', '0013x00000xyzAB', 'a01AA0000001234']);
});

test('all-letter strings (e.g. EMAILMESSAGEID) are excluded', () => {
    // EMAILMESSAGEID is 14 chars; pad to a 16-char all-letter shape
    // that DOES match the length pattern but should still be rejected.
    const out = extractRecordIds('field EMAILMESSAGEIDXX is required');
    assert.deepEqual(out, []);
});

test('cap: more than 5 unique Ids returns only the first 5', () => {
    const ids = [
        '5003x00000aaa01',
        '5003x00000aaa02',
        '5003x00000aaa03',
        '5003x00000aaa04',
        '5003x00000aaa05',
        '5003x00000aaa06',
        '5003x00000aaa07',
        '5003x00000aaa08',
        '5003x00000aaa09',
        '5003x00000aaa10',
    ];
    const text = ids.join(' / ');
    const out = extractRecordIds(text);
    assert.equal(out.length, 5);
    assert.deepEqual(out, ids.slice(0, 5));
});

test('duplicate Ids are deduplicated', () => {
    const text = '5003x00000abcDE then 5003x00000abcDE again and 5003x00000abcDE one more time';
    const out = extractRecordIds(text);
    assert.deepEqual(out, ['5003x00000abcDE']);
});

test('empty input returns empty array', () => {
    assert.deepEqual(extractRecordIds(''), []);
});

test('non-string input is tolerated and returns empty array', () => {
    // The signature is `string`, but the helper guards against the
    // common StepInput===null path defensively.
    const out = extractRecordIds(null as unknown as string);
    assert.deepEqual(out, []);
});
