---
title: LLM Provider Runtime — Internal Gateway Findings
---

# LLM Provider Runtime — Internal Gateway Findings

This page documents how Workbench routes LLM requests when the Salesforce-internal `eng-ai-model-gateway` is configured, and the known wire-format quirks we've observed while exercising the gateway with a live harness. It is primarily a reference for engineers debugging streaming, reasoning, or tool-call behavior on internal builds.

If you are a regular user configuring a public provider (OpenAI, Anthropic, Gemini, Mistral, xAI Grok, Workbench Free Tier), see [AI Agent Setup & Capabilities](./setup). The routing described here only kicks in when a provider's base URL contains `eng-ai-model-gateway`.

---

## Runtime routing

Each provider has its own runtime module under `packages/lwc/main/agent/utils/provider/`. The dispatcher picks a runtime based on three inputs: the provider name, the base URL, and whether the call is marked `isInternal`.

| Condition | Runtime selected | Notes |
|---|---|---|
| `provider === 'anthropic'` **and** base URL ends with `/bedrock` | `anthropic/runtime.ts` + Bedrock transformer | Request rewritten to `/model/<id>/invoke` or `/invoke-with-response-stream`; response piped through an AWS eventstream → SSE decoder. |
| `provider === 'gemini'` **and** `isInternal` | `gemini/runtime.ts` using `instance.chat(...)` | Uses native Google SDK against the gateway's `/v1beta` surface. |
| `isInternal` (anything else) | `internal/runtime.ts` | OpenAI-compatible client routed to the gateway's `/responses` endpoint. |
| Otherwise | `PROVIDER_RUNTIMES[provider]` | Direct to provider's public API. |

The Bedrock detection is a simple predicate:

```ts
// packages/lwc/main/agent/utils/provider/anthropic/bedrock.ts
export function isAnthropicBedrockGateway(provider, baseUrl) {
    return normalizeLlmProvider(provider) === 'anthropic'
        && normalizeBaseUrl(baseUrl).endsWith('/bedrock');
}
```

---

## Supported internal models

Defined in `packages/lwc/shared/modules/llm/constants.ts` (`INTERNAL_MODEL_OPTIONS`).

| Provider | Model ID | Transport | Reasoning support |
|---|---|---|---|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5.2-codex`, `gpt-5.3-codex` | `/responses` | `gpt-5*` stream reasoning-deltas then flush text |
| Anthropic (Bedrock) | `us.anthropic.claude-opus-4-7` | `/bedrock/model/.../invoke[-with-response-stream]` | Opus-4-7 thinking unsupported — see below |
| Anthropic (Bedrock) | `us.anthropic.claude-sonnet-4-6` | same | Classic `thinking: { type: 'enabled' }` budgets work |
| Anthropic (Bedrock) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | same | No reasoning; text-only |
| Gemini | `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview` | `/v1beta` | Thought parts may not stream on preview models |

---

## Known wire-format limitations

These are not bugs in the Workbench runtime — they are gateway or upstream SDK behaviors we've confirmed with the provider harness. The runtime modules carry inline comments pointing back here.

### OpenAI `/responses` — text arrives as a single burst after reasoning

For reasoning models (`gpt-5`, `gpt-5-mini`, etc.), the OpenAI `/responses` endpoint streams `reasoning-delta` chunks incrementally while the model thinks, then flushes the final answer as one rapid burst of `text-delta` chunks (observed spread: ~145–220 ms for ~90 deltas). This is the upstream wire shape; client-side throttling would only add latency.

The harness's streaming gate accepts this by checking both text and reasoning spread — whichever channel met the ≥150 ms threshold satisfies the check. See `tools/llm-provider-harness/runner.ts::checkExpectations`.

### Gemini preview — `thought: true` parts can be silently dropped

`gemini-3-pro-preview` through the gateway's `/v1beta` endpoint reports real reasoning usage (`providerMetadata.google.usageMetadata.thoughtsTokenCount > 0`) but does not emit any `thought: true` parts in the stream, even with `thinkingConfig.includeThoughts: true` set in `provider/gemini/runtime.ts`.

Whether this is a `@ai-sdk/google` bug or a gateway-side strip is unclear. The runtime does the right thing; downstream consumers should treat a missing thought stream as possible, not a regression. The harness uses `thoughtsTokenCount` as authoritative evidence of reasoning when no deltas arrived.

### Opus-4-7 on Bedrock — `thinking: { type: 'enabled' }` is rejected

`us.anthropic.claude-opus-4-7` rejects the classic Anthropic thinking payload:

```
"thinking.type.enabled" is not supported for this model.
Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.
```

`@ai-sdk/anthropic@3.0.68` only knows the classic shape. Until the SDK supports adaptive thinking — or we add a Bedrock-side request rewriter — Opus-4-7 **thinking is not supported** through Workbench. Opus-4-7 text generation and tool calling work normally. Sonnet-4-6 and Haiku-4-5 still accept the classic payload, so those cover the thinking path in the harness.

### Opus-4-7 — `temperature` is rejected outright

Unlike other internal models (which warn and strip it), Opus-4-7 returns an HTTP 500 when `temperature` is present in the request body. The harness no longer hard-codes `temperature`; consumers should omit it for Opus-4-7 requests.

---

## Running the harness

The harness lives under `tools/llm-provider-harness/` and exercises each supported model end-to-end against the internal gateway. It is **not** a unit test — it requires network and a real gateway key — so it's invoked manually rather than as part of `npm test`.

```sh
# Streaming only
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxx npm run test:provider:internal:streaming

# Non-streaming only
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxx npm run test:provider:internal:non-streaming

# Both in sequence
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxx npm run test:provider:internal
```

Each run writes a JSONL report to `tools/llm-provider-harness/out/<ISO-timestamp>-<mode>.jsonl`. Inspect per-chunk payloads with `jq`:

```sh
# All reasoning-delta timings for one scenario
jq -c 'select(.scenario=="openai-reasoning" and .type=="reasoning-delta") | {elapsedMs}' out/<file>.jsonl
```

### Scenario matrix

| Scenario | Provider / Model | Exercises |
|---|---|---|
| `openai-basic` | openai / `gpt-4o-mini` | Text streaming |
| `openai-reasoning` | openai / `gpt-5-mini` | Reasoning-delta + burst text |
| `openai-tool-call` | openai / `gpt-4o-mini` | Tool-call via `/responses` |
| `openai-multiturn` | openai / `gpt-4o` | Tool-result round-trip |
| `gemini-basic` | gemini / `gemini-3-flash-preview` | Native Google SDK streaming |
| `gemini-thinking` | gemini / `gemini-3-pro-preview` | `thinkingLevel` path (usage-token fallback) |
| `gemini-tool-call` | gemini / `gemini-3-flash-preview` | Gemini tool-call shape |
| `bedrock-haiku-basic` | anthropic / `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Bedrock eventstream → SSE |
| `bedrock-sonnet-thinking` | anthropic / `us.anthropic.claude-sonnet-4-6` | Bedrock thinking budget |
| `bedrock-haiku-tool-call` | anthropic / same as above | Bedrock tool-call |
| `bedrock-opus-tool-call` | anthropic / `us.anthropic.claude-opus-4-7` | Opus-4-7 tool-calling |

Opus-4-7 thinking is intentionally excluded (see above).

### Streaming quality gates

In streaming mode, scenarios with `expectStreaming: true` and no tools must produce:

- ≥3 `text-delta` chunks, **and**
- Either text-delta spread **or** reasoning-delta spread ≥ 150 ms.

The reasoning fallback matters for OpenAI `/responses` models that flush text as a single burst.

Reasoning detection also falls back to `providerMetadata.google.usageMetadata.thoughtsTokenCount > 0` when the SDK emits no explicit reasoning chunks — this covers the Gemini preview case described above.

### Non-streaming retries

Non-streaming scenarios are allowed one retry (`maxRetries: 1`) to absorb transient upstream 5xx flakes observed on Opus-4-7 tool calls. Streaming keeps `maxRetries: 0` so wire-shape regressions still surface immediately.

---

## Observed performance (reference only)

Representative numbers from a recent harness run; they move with the gateway and are meant to give a rough sense of shape.

| Model | TTFB (streaming) | Throughput |
|---|---|---|
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | ~850 ms | ~300 ch/s |
| `gpt-4o-mini` | ~1.1 s | ~180 ch/s |
| `gemini-3-flash-preview` | ~3.5 s | ~120 ch/s (chunky: ~5 deltas total) |
| `us.anthropic.claude-sonnet-4-6` (medium thinking) | ~1.2 s | ~75 ch/s + ~13 reasoning-deltas |
| `gpt-5-mini` (medium reasoning) | ~4 s first reasoning token, ~9 s first text | ~170 reasoning-deltas over ~3 s |
| `gemini-3-pro-preview` (high thinking) | ~12–14 s first text | 0 reasoning-deltas (see above) |

---

## Related docs

- [AI Agent Setup & Capabilities](./setup)
- [AI Agent Tools Overview](./tools-overview)
