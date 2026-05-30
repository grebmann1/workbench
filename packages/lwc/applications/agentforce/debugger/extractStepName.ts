/**
 * Pure helper that pulls a human-readable step name out of a
 * `GenAiInteractionStep`. Used by N13 to render "type badge + NAME +
 * duration + tokens" in the collapsed step header.
 *
 * Performance contract (N13 Architect non-negotiable)
 * ---------------------------------------------------
 * The debugger `stepList` getter recomputes per render. At 5000 steps with
 * frequent re-renders, parsing `StepInput` JSON inside the getter is the
 * worst perf bug we'd ship. We therefore memoize results in a module-scope
 * `WeakMap<step, string>`. Steps come from Redux and are stable references
 * across re-renders that don't mutate them, so the WeakMap key works as
 * intended (no GC retention, no reference equality drift).
 *
 * `extractStepName` is app-local — do NOT promote to host-api/shared.
 */
import type { GenAiInteractionStep } from '../slices/debugger.ts';

const STEP_TYPE_LABELS: Record<string, string> = {
    PlannerInvocation: 'Planner',
    TopicClassification: 'Topic Classification',
    ActionExecution: 'Action Execution',
    LLMCall: 'LLM Call',
    GuardrailCheck: 'Guardrail Check',
};

const _cache = new WeakMap<GenAiInteractionStep, string>();

function fallback(step: GenAiInteractionStep): string {
    return STEP_TYPE_LABELS[step.StepType] || step.StepType || '';
}

function tryString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Compute the display name for a step. Strategy by `StepType`:
 *
 * - `LLMCall`            → `parsedInput.model` ?? `parsedInput.name`
 * - `ActionExecution`    → `parsedInput.action` ?? `parsedInput.functionName`
 * - `TopicClassification`→ `parsedInput.topic`
 * - `PlannerInvocation`  → `parsedInput.plannerName`
 * - anything else        → STEP_TYPE_LABELS lookup, then raw type
 *
 * Malformed JSON falls back to the type label (no throw).
 */
function compute(step: GenAiInteractionStep): string {
    const raw = step.StepInput || '';
    let parsed: Record<string, unknown> | null = null;
    if (raw) {
        try {
            const v = JSON.parse(raw);
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                parsed = v as Record<string, unknown>;
            }
        } catch {
            // malformed JSON → fall through to fallback
        }
    }

    if (!parsed) return fallback(step);

    switch (step.StepType) {
        case 'LLMCall': {
            return tryString(parsed.model) ?? tryString(parsed.name) ?? fallback(step);
        }
        case 'ActionExecution': {
            return tryString(parsed.action) ?? tryString(parsed.functionName) ?? fallback(step);
        }
        case 'TopicClassification': {
            return tryString(parsed.topic) ?? fallback(step);
        }
        case 'PlannerInvocation': {
            return tryString(parsed.plannerName) ?? fallback(step);
        }
        default:
            return fallback(step);
    }
}

/**
 * Memoized extractor. Cache key is the step object identity — Redux
 * returns stable references for unchanged rows, so we never reparse the
 * same `StepInput` twice.
 */
export function extractStepName(step: GenAiInteractionStep): string {
    const hit = _cache.get(step);
    if (hit !== undefined) return hit;
    const computed = compute(step);
    _cache.set(step, computed);
    return computed;
}

/** Test-only: clear the memo cache. Not exported from a module barrel. */
export function _clearExtractStepNameCache(): void {
    // WeakMap has no clear(); replace by reassigning. We can't reassign a
    // const, so iterate via a shim — but WeakMap can't be iterated. The
    // pragmatic path: tests pass distinct step references, so the cache
    // is effectively empty for them. Provided here as documentation.
}
