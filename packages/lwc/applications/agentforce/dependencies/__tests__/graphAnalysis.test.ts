/**
 * Tests for the agentforce dependency-graph analysis module.
 *
 * Covers `findCycles`, `computeCentrality`, `computeDiameter`, and `analyze`
 * across five fixture topologies (linear chain, single cycle, disconnected
 * components, single node, 200-node random) plus a perf-budget guard.
 *
 * The module is pure — it only depends on `GraphData` plain objects — so we
 * import it directly without any host stubs.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';

import {
    analyze,
    computeCentrality,
    computeDiameter,
    findCycles,
    type GraphData,
    type GraphEdge,
    type GraphNode,
} from '../graphAnalysis.ts';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function node(id: string, type: GraphNode['type'] = 'agent'): GraphNode {
    return { id, label: id, type };
}

function edge(from: string, to: string): GraphEdge {
    return { from, to };
}

/** A → B → C → D — no cycles, diameter 3. */
function linearChain(): GraphData {
    return {
        nodes: [node('A'), node('B'), node('C'), node('D')],
        edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
    };
}

/** A → B → C → A — single 3-cycle. */
function simpleCycle(): GraphData {
    return {
        nodes: [node('A'), node('B'), node('C')],
        edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')],
    };
}

/** Two disconnected components: A→B and C→D. */
function disconnected(): GraphData {
    return {
        nodes: [node('A'), node('B'), node('C'), node('D')],
        edges: [edge('A', 'B'), edge('C', 'D')],
    };
}

/** Single isolated node. */
function singleNode(): GraphData {
    return { nodes: [node('A')], edges: [] };
}

/**
 * Pseudo-random 200-node DAG-ish graph. Uses a deterministic LCG so the
 * fixture is stable across runs (no flake on the perf-budget assertion).
 */
function randomGraph(size: number, seed = 42): GraphData {
    let state = seed >>> 0;
    const next = () => {
        // Numerical Recipes LCG — good enough for fixture determinism.
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
    const nodes: GraphNode[] = [];
    for (let i = 0; i < size; i++) nodes.push(node(`n${i}`));
    const edges: GraphEdge[] = [];
    // Sparse: roughly 2 outgoing edges per node, biased forward to keep the
    // graph mostly DAG (small chance of a back-edge to seed cycles).
    for (let i = 0; i < size; i++) {
        const outDegree = 1 + Math.floor(next() * 3); // 1..3
        for (let k = 0; k < outDegree; k++) {
            const target = Math.floor(next() * size);
            if (target !== i) edges.push(edge(`n${i}`, `n${target}`));
        }
    }
    return { nodes, edges };
}

// ---------------------------------------------------------------------------
// findCycles
// ---------------------------------------------------------------------------

test('findCycles: linear chain has no cycles', () => {
    assert.deepEqual(findCycles(linearChain()), []);
});

test('findCycles: simple 3-cycle is detected as one SCC of size 3', () => {
    const cycles = findCycles(simpleCycle());
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].length, 3);
    assert.deepEqual(cycles[0].slice().sort(), ['A', 'B', 'C']);
});

test('findCycles: disconnected components without cycles return []', () => {
    assert.deepEqual(findCycles(disconnected()), []);
});

test('findCycles: single node returns []', () => {
    assert.deepEqual(findCycles(singleNode()), []);
});

test('findCycles: deterministic across repeated calls (regression guard)', () => {
    // Catch non-determinism (e.g. iteration over Map insertion order) — if
    // the algorithm depends on Set/Map randomness, these would diverge.
    const g = randomGraph(200, 7);
    const a = findCycles(g);
    const b = findCycles(g);
    // Compare via stable string keys (each component sorted).
    const stable = (cs: string[][]) =>
        cs.map(c => c.slice().sort().join(',')).sort();
    assert.deepEqual(stable(a), stable(b));
});

// ---------------------------------------------------------------------------
// computeCentrality
// ---------------------------------------------------------------------------

test('computeCentrality: <3 nodes returns empty map (degenerate case)', () => {
    assert.equal(computeCentrality(singleNode()).size, 0);
    assert.equal(computeCentrality({ nodes: [node('A'), node('B')], edges: [edge('A', 'B')] }).size, 0);
});

test('computeCentrality: linear chain — middle node B is the bottleneck', () => {
    // Path A → B → C: B mediates the only A→C path, so its betweenness is
    // strictly positive while the endpoints have 0.
    const c = computeCentrality({
        nodes: [node('A'), node('B'), node('C')],
        edges: [edge('A', 'B'), edge('B', 'C')],
    });
    assert.ok((c.get('B') ?? 0) > 0, 'B must have positive centrality');
    assert.equal(c.get('A'), 0, 'endpoint A has no betweenness');
    assert.equal(c.get('C'), 0, 'endpoint C has no betweenness');
    // Normalized: max = 1.
    assert.equal(c.get('B'), 1, 'centrality is normalized so the max is 1');
});

// ---------------------------------------------------------------------------
// computeDiameter
// ---------------------------------------------------------------------------

test('computeDiameter: linear chain of length 4 has diameter 3', () => {
    assert.equal(computeDiameter(linearChain()), 3);
});

test('computeDiameter: empty graph returns 0', () => {
    assert.equal(computeDiameter({ nodes: [], edges: [] }), 0);
});

test('computeDiameter: disconnected components — diameter is the longest within any component', () => {
    // Two components of length 1 each: A→B and C→D. Diameter is 1.
    assert.equal(computeDiameter(disconnected()), 1);
});

// ---------------------------------------------------------------------------
// analyze() — composition + bottlenecks
// ---------------------------------------------------------------------------

test('analyze: returns the documented shape (cycles/centrality/diameter/bottlenecks)', () => {
    const r = analyze(linearChain());
    assert.ok(Array.isArray(r.cycles));
    assert.ok(r.centrality instanceof Map);
    assert.equal(typeof r.diameter, 'number');
    assert.ok(Array.isArray(r.bottlenecks));
});

test('analyze: bottlenecks list is at most 3 entries with positive centrality', () => {
    const r = analyze(randomGraph(200, 11));
    assert.ok(r.bottlenecks.length <= 3, 'bottlenecks capped at 3');
    for (const id of r.bottlenecks) {
        const v = r.centrality.get(id);
        assert.ok(v !== undefined && v > 0, `${id} must have positive centrality`);
    }
});

// ---------------------------------------------------------------------------
// Perf budget — N15 acceptance criterion
// ---------------------------------------------------------------------------

test('analyze: 200-node fixture completes within perf budget', () => {
    const g = randomGraph(200, 1);
    // Warmup once to amortize V8 tier-up — the budget is for steady state.
    analyze(g);

    const start = performance.now();
    analyze(g);
    const elapsed = performance.now() - start;

    // Goal: <50ms on a single core. CI machines vary wildly, so we assert a
    // looser <200ms upper bound to avoid flakes and log the actual timing.
    // If this regresses past 50ms locally, treat it as a soft signal.
    // eslint-disable-next-line no-console
    console.log(`analyze(200 nodes) took ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 200, `analyze() exceeded 200ms budget (was ${elapsed.toFixed(2)}ms)`);
});
