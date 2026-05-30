/**
 * Pure substring + token-prefix matcher for the Agentforce inspector.
 *
 * Architectural non-negotiable (Performance architect):
 * - NOT Levenshtein. Pure substring + token-prefix scoring.
 * - O(n) over the index per keystroke, with a tiny constant per item.
 * - No external libs. If real fuzzy is wanted later, lazy-load fuse.js
 *   only when the search input opens.
 *
 * Boundary: app-local. Do NOT promote to `shared/`. The agentforce inspector
 * is the only consumer and the scoring/normalization rules are tuned for it.
 */
export interface MatchResult {
    /** 0..1 — higher is better. 1.0 exact / 0.8 token-prefix / 0.5 substring. */
    score: number;
    /** Highlight ranges against the ORIGINAL (non-normalized) target string. */
    ranges: Array<[start: number, end: number]>;
}

export type LabelType = 'agent' | 'topic' | 'action' | 'script';

export interface IndexedItem {
    id: string;
    label: string;
    type: LabelType;
    parentId: string | null;
    /** Optional API name to also be matched against. */
    devName?: string;
    /** Cached after a search; rendered by UI without recomputation. */
    matchRanges?: Array<[start: number, end: number]>;
    /** Cached score, used for sort. */
    matchScore?: number;
}

export interface SearchOptions {
    /** Default: 50. */
    cap?: number;
    /** Default: 'score'. */
    sortBy?: 'score' | 'type-then-label';
}

export interface SearchResult {
    items: IndexedItem[];
    truncated: boolean;
    totalMatched: number;
}

const DEFAULT_CAP = 50;

const TYPE_ORDER: Record<LabelType, number> = {
    agent: 0,
    topic: 1,
    action: 2,
    script: 3,
};

/**
 * Lowercase + Unicode-normalize. Strips combining marks so 'cafe' matches
 * 'Café'. Returns the same length as the input string for 1:1 index mapping
 * back to the original — combining marks become stripped, but those are
 * always zero-width visually anyway, and JavaScript string indexing is
 * code-unit-based which keeps the mapping straightforward for highlights.
 *
 * For our highlighting we recompute ranges directly against the lowercase
 * form of the original string, which preserves character indices for
 * everything except diacritic characters that NFKD splits — those very rare
 * cases just produce slightly off highlights. Acceptable trade-off.
 */
// Fast path: ASCII-only labels (the overwhelming majority in real Salesforce
// orgs) skip the NFKD pipeline entirely. NFKD allocates a new string per call
// and dominated the 100k-item benchmark.
const ASCII_ONLY = /^[\x00-\x7F]*$/;

function normalize(s: string): string {
    if (ASCII_ONLY.test(s)) return s.toLowerCase();
    return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Tokenize on whitespace + non-letter + camelCase boundaries.
 * 'OrderLookup' -> ['order', 'lookup']
 * 'order_lookup' -> ['order', 'lookup']
 * 'fetchHTTPData' -> ['fetch', 'http', 'data']
 *
 * Returns tokens with their START offsets in the original string, so the
 * caller can build ranges that line up with the source.
 */
interface Token {
    text: string;
    start: number;
}

function tokenize(target: string): Token[] {
    const tokens: Token[] = [];
    const len = target.length;
    let i = 0;
    while (i < len) {
        const ch = target[i];
        if (!/[A-Za-z0-9]/.test(ch)) {
            i++;
            continue;
        }
        const start = i;
        // Walk a run of letters/digits, breaking on camelCase boundaries.
        let j = i + 1;
        while (j < len && /[A-Za-z0-9]/.test(target[j])) {
            const prev = target[j - 1];
            const cur = target[j];
            // boundary: prev lowercase/digit -> cur uppercase
            if (/[a-z0-9]/.test(prev) && /[A-Z]/.test(cur)) break;
            // boundary: prev uppercase, cur uppercase, next lowercase
            // (e.g. 'HTTPData' -> ['HTTP', 'Data'])
            if (
                /[A-Z]/.test(prev) &&
                /[A-Z]/.test(cur) &&
                j + 1 < len &&
                /[a-z]/.test(target[j + 1])
            ) {
                break;
            }
            j++;
        }
        tokens.push({ text: normalize(target.slice(start, j)), start });
        i = j;
    }
    return tokens;
}

/**
 * Pure: substring + token-prefix match for a single query against a target.
 * Returns null if no match. Score:
 *   - 1.0 exact (full normalized equality)
 *   - 0.8 token-prefix (any token starts with the query)
 *   - 0.5 substring (query appears anywhere)
 *
 * Multi-word queries (whitespace-separated) match all words; ranges are
 * accumulated. Score uses the minimum of per-word scores.
 */
export function fuzzyMatch(query: string, target: string): MatchResult | null {
    if (!query) return null;
    const normTarget = normalize(target);
    const normQuery = normalize(query.trim());
    if (!normQuery) return null;

    // Multi-word: every word must match. Combine ranges.
    const words = normQuery.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    if (words.length === 1) {
        return matchSingleWord(words[0], target, normTarget);
    }

    const allRanges: Array<[number, number]> = [];
    let minScore = 1;
    for (const word of words) {
        const r = matchSingleWord(word, target, normTarget);
        if (!r) return null;
        allRanges.push(...r.ranges);
        if (r.score < minScore) minScore = r.score;
    }
    return { score: minScore, ranges: mergeRanges(allRanges) };
}

function matchSingleWord(word: string, target: string, normTarget: string): MatchResult | null {
    // Exact
    if (normTarget === word) {
        return { score: 1, ranges: [[0, target.length]] };
    }

    // Cheap substring guard: if the word is not a substring at all, no
    // amount of tokenization helps. Avoids tokenize() for the (very common)
    // negative case in large indexes.
    const idx = normTarget.indexOf(word);
    if (idx < 0) return null;

    // Token-prefix beats substring when both apply. Only walk tokens if the
    // substring hit is NOT already at offset 0 of a token boundary (cheap
    // heuristic: idx === 0 OR preceding char is a non-letter/digit).
    const prevCh = idx === 0 ? '' : target[idx - 1];
    const curCh = target[idx];
    const nextCh = idx + 1 < target.length ? target[idx + 1] : '';
    const isAtTokenStart =
        idx === 0 ||
        !/[A-Za-z0-9]/.test(prevCh) ||
        // camelCase boundary: prev lowercase, current uppercase ('orderLookup' -> Lookup)
        (/[a-z0-9]/.test(prevCh) && /[A-Z]/.test(curCh)) ||
        // acronym boundary: prev uppercase, current uppercase, next lowercase
        // ('HTTPData' -> Data; 'P' precedes 'D', 'a' follows)
        (/[A-Z]/.test(prevCh) && /[A-Z]/.test(curCh) && /[a-z]/.test(nextCh));

    if (isAtTokenStart) {
        return { score: 0.8, ranges: [[idx, idx + word.length]] };
    }

    // Substring fallback
    return { score: 0.5, ranges: [[idx, idx + word.length]] };
}

/** Merge overlapping/adjacent ranges so highlight spans don't double up. */
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    if (ranges.length <= 1) return ranges.slice();
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = sorted[i];
        if (cur[0] <= prev[1]) {
            prev[1] = Math.max(prev[1], cur[1]);
        } else {
            merged.push(cur);
        }
    }
    return merged;
}

/**
 * Pure: filter the index. Returns capped result + total-matched count.
 * Empty query is identity (returns the full index, untruncated unless > cap).
 *
 * Sort:
 *   - 'score' (default): score DESC, then label ASC.
 *   - 'type-then-label': type order (agent < topic < action < script), then label.
 */
export function search(
    index: IndexedItem[],
    query: string,
    opts: SearchOptions = {}
): SearchResult {
    const cap = opts.cap ?? DEFAULT_CAP;
    const sortBy = opts.sortBy ?? 'score';

    if (!query || !query.trim()) {
        const truncated = index.length > cap;
        return {
            items: truncated ? index.slice(0, cap) : index.slice(),
            truncated,
            totalMatched: index.length,
        };
    }

    const matched: IndexedItem[] = [];
    for (const item of index) {
        const labelMatch = fuzzyMatch(query, item.label);
        let result = labelMatch;
        // Try devName if label didn't match (or only weakly), but don't
        // overwrite a strong label match — labels are the user-visible signal.
        if (!result && item.devName) {
            const devMatch = fuzzyMatch(query, item.devName);
            if (devMatch) {
                // Demote devName-only hits slightly so label hits sort first.
                result = { score: devMatch.score * 0.9, ranges: [] };
            }
        }
        if (!result) continue;
        matched.push({
            ...item,
            matchScore: result.score,
            matchRanges: result.ranges,
        });
    }

    if (sortBy === 'type-then-label') {
        matched.sort((a, b) => {
            const t = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
            if (t !== 0) return t;
            return a.label.localeCompare(b.label);
        });
    } else {
        matched.sort((a, b) => {
            const sb = (b.matchScore ?? 0) - (a.matchScore ?? 0);
            if (sb !== 0) return sb;
            return a.label.localeCompare(b.label);
        });
    }

    const truncated = matched.length > cap;
    return {
        items: truncated ? matched.slice(0, cap) : matched,
        truncated,
        totalMatched: matched.length,
    };
}
