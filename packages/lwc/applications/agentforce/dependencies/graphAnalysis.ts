export interface GraphNode {
    id: string;
    label: string;
    type: 'agent' | 'topic' | 'action' | 'flow' | 'apex';
}

export interface GraphEdge {
    from: string;
    to: string;
    label?: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface AnalysisResult {
    cycles: string[][];
    centrality: Map<string, number>;
    diameter: number;
    bottlenecks: string[];
}

function buildAdjList(graph: GraphData): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) adj.set(n.id, []);
    for (const e of graph.edges) {
        const list = adj.get(e.from);
        if (list) list.push(e.to);
    }
    return adj;
}

function buildReverseAdjList(graph: GraphData): Map<string, string[]> {
    const radj = new Map<string, string[]>();
    for (const n of graph.nodes) radj.set(n.id, []);
    for (const e of graph.edges) {
        const list = radj.get(e.to);
        if (list) list.push(e.from);
    }
    return radj;
}

function dfsForward(
    node: string,
    adj: Map<string, string[]>,
    visited: Set<string>,
    order: string[]
) {
    visited.add(node);
    for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) dfsForward(neighbor, adj, visited, order);
    }
    order.push(node);
}

function dfsReverse(
    node: string,
    radj: Map<string, string[]>,
    visited: Set<string>,
    component: string[]
) {
    visited.add(node);
    component.push(node);
    for (const neighbor of radj.get(node) || []) {
        if (!visited.has(neighbor)) dfsReverse(neighbor, radj, visited, component);
    }
}

export function findCycles(graph: GraphData): string[][] {
    const adj = buildAdjList(graph);
    const radj = buildReverseAdjList(graph);
    const order: string[] = [];
    const visited = new Set<string>();

    for (const node of graph.nodes) {
        if (!visited.has(node.id)) dfsForward(node.id, adj, visited, order);
    }

    visited.clear();
    const components: string[][] = [];
    for (let i = order.length - 1; i >= 0; i--) {
        if (!visited.has(order[i])) {
            const comp: string[] = [];
            dfsReverse(order[i], radj, visited, comp);
            if (comp.length > 1) components.push(comp);
        }
    }
    return components;
}

export function computeCentrality(graph: GraphData): Map<string, number> {
    const centrality = new Map<string, number>();
    if (graph.nodes.length < 3) return centrality;

    for (const n of graph.nodes) centrality.set(n.id, 0);
    const adj = buildAdjList(graph);

    for (const s of graph.nodes) {
        const stack: string[] = [];
        const pred = new Map<string, string[]>();
        const sigma = new Map<string, number>();
        const dist = new Map<string, number>();

        for (const n of graph.nodes) {
            pred.set(n.id, []);
            sigma.set(n.id, 0);
            dist.set(n.id, -1);
        }
        sigma.set(s.id, 1);
        dist.set(s.id, 0);

        const queue: string[] = [s.id];
        while (queue.length > 0) {
            const v = queue.shift()!;
            stack.push(v);
            for (const w of adj.get(v) || []) {
                if (dist.get(w)! < 0) {
                    queue.push(w);
                    dist.set(w, dist.get(v)! + 1);
                }
                if (dist.get(w) === dist.get(v)! + 1) {
                    sigma.set(w, sigma.get(w)! + sigma.get(v)!);
                    pred.get(w)!.push(v);
                }
            }
        }

        const delta = new Map<string, number>();
        for (const n of graph.nodes) delta.set(n.id, 0);

        while (stack.length > 0) {
            const w = stack.pop()!;
            for (const v of pred.get(w)!) {
                const d = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
                delta.set(v, delta.get(v)! + d);
            }
            if (w !== s.id) {
                centrality.set(w, centrality.get(w)! + delta.get(w)!);
            }
        }
    }

    const max = Math.max(...centrality.values(), 1);
    for (const [k, v] of centrality) centrality.set(k, v / max);
    return centrality;
}

export function computeDiameter(graph: GraphData): number {
    if (graph.nodes.length === 0) return 0;
    const adj = buildAdjList(graph);
    let maxDist = 0;

    for (const s of graph.nodes) {
        const dist = new Map<string, number>();
        dist.set(s.id, 0);
        const queue: string[] = [s.id];
        while (queue.length > 0) {
            const v = queue.shift()!;
            for (const w of adj.get(v) || []) {
                if (!dist.has(w)) {
                    dist.set(w, dist.get(v)! + 1);
                    queue.push(w);
                }
            }
        }
        for (const d of dist.values()) {
            if (d > maxDist) maxDist = d;
        }
    }
    return maxDist;
}

export function analyze(graph: GraphData): AnalysisResult {
    const cycles = findCycles(graph);
    const centrality = computeCentrality(graph);
    const diameter = computeDiameter(graph);
    const sorted = [...centrality.entries()].sort((a, b) => b[1] - a[1]);
    const bottlenecks = sorted
        .slice(0, 3)
        .filter(([, v]) => v > 0)
        .map(([id]) => id);
    return { cycles, centrality, diameter, bottlenecks };
}
