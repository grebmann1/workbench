# llm-provider-harness

Live end-to-end harness for the agent's internal LLM provider runtimes. Hits the
Salesforce-internal **eng-ai-model-gateway** using a real employee key and
exercises each scenario through `packages/lwc/main/agent/utils/provider/`.

Output is a JSONL dump of every `fullStream` chunk (streaming mode) or final
response (non-streaming mode) plus a per-scenario summary, so we can review
streaming / formatting / thinking behaviour against real provider output and
fix the relevant runtime module when something looks off.

This is NOT a unit test: it needs network + a real key, so it lives outside
`npm test`. Scenarios cover the internal path across OpenAI, Gemini, and the
Anthropic-via-Bedrock gateway.

## Run

Two modes are exposed — streaming (via `streamText` + `fullStream`) and
non-streaming (via `generateText`). Each mode uses the same scenario set.

```sh
# streaming only
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxxxxxxxxxx npm run test:provider:internal:streaming

# non-streaming only
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxxxxxxxxxx npm run test:provider:internal:non-streaming

# both in sequence
WORKBENCH_GATEWAY_KEY=sk-xxxxxxxxxxxxxxxx npm run test:provider:internal
```

The key only works from machines authorised to reach the gateway. If the env
var is missing, the harness exits 2 with a usage message.

## Security

The JSONL reports scrub obvious secrets (`Authorization` header values, `sk-…`
tokens, and API-key query params such as `api_key`, `access_token`, `key`)
before writing to disk. That makes `out/*.jsonl` safe to share with other
engineers for debugging. Reports predating the scrubber (older timestamps) may
contain raw tokens — delete or re-grep them before sharing.

## Output

- Console: one line per scenario with pass/fail, chunk counts, timing, finish reason.
- `tools/llm-provider-harness/out/<ISO-timestamp>-<mode>.jsonl` — one JSON row
  per chunk plus one summary/error row per scenario. Grep by scenario name, or
  `jq` by `.type` to inspect specific event shapes
  (e.g. `.type == "reasoning-delta"`).

Exit code is non-zero if any scenario fails its expectations.

### Streaming mode quality gates

In streaming mode, scenarios with `expectStreaming: true` and no tools must
produce at least 3 `text-delta` chunks, and _some_ streamed channel must have
spread over ≥150 ms — either text-delta spread or reasoning-delta spread. The
fallback matters for reasoning models (OpenAI `/responses`) that stream
reasoning incrementally then emit final text as one burst.

For reasoning expectations, `sawReasoning` is also set true when the `finish`
chunk's `providerMetadata.google.usageMetadata.thoughtsTokenCount > 0`, even
if the SDK never emitted a `reasoning-delta`. This covers Gemini preview
models that think without surfacing thought parts.

## Scenarios

Defined in `scenarios.mjs`:

| name                    | provider / model                                        | exercises                                     |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------- |
| openai-basic            | openai / gpt-4o-mini                                    | text streaming                                |
| openai-reasoning        | openai / gpt-5-mini (medium)                            | reasoning deltas + final text                 |
| openai-tool-call        | openai / gpt-4o-mini + `get_time`                       | tool-call chunk shape via OpenAI /responses   |
| openai-multiturn        | openai / gpt-4o + `get_time`                            | tool result round-trip                        |
| gemini-basic            | gemini / gemini-3-flash-preview                         | native Google SDK streaming via /v1beta       |
| gemini-thinking         | gemini / gemini-3-pro-preview (high)                    | thinkingLevel path (thoughtsTokenCount proof) |
| gemini-tool-call        | gemini / gemini-3-flash-preview + tool                  | Gemini tool-call chunk shape                  |
| bedrock-haiku-basic     | anthropic / us.anthropic.claude-haiku-4-5-20251001-v1:0 | Bedrock eventstream → SSE, text streaming     |
| bedrock-sonnet-thinking | anthropic / us.anthropic.claude-sonnet-4-6 (medium)     | Bedrock thinking budget + reasoning deltas    |
| bedrock-haiku-tool-call | anthropic / us.anthropic.claude-haiku-4-5-20251001-v1:0 | Bedrock tool-call shape                       |
| bedrock-opus-tool-call  | anthropic / us.anthropic.claude-opus-4-7 + tool         | Opus on Bedrock tool-call shape               |

> Opus-4-7 thinking is intentionally **not** covered: the gateway rejects
> `@ai-sdk/anthropic`'s `thinking: { type: 'enabled' }` payload and requires
> the newer `thinking: { type: 'adaptive' }` + `output_config.effort` shape.
> See the comment in `provider/anthropic/runtime.ts::resolveOptions`.

All `bedrock-*` scenarios use `provider: 'anthropic'` — the Bedrock transport
is engaged automatically by `isAnthropicBedrockGateway()` when the internal
baseUrl ends with `/bedrock`.

## Extending

Add a new entry to `SCENARIOS` in `scenarios.mjs`. Fields:

- `name`: unique scenario id (used in output + JSONL filter).
- `provider`: `'openai' | 'gemini'` (anthropic excluded for internal path).
- `modelId`: exact internal model id.
- `prompt`: user prompt.
- `tools`: optional map of `ai` SDK `tool({...})` instances.
- `reasoningEffort`: optional `'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`.
- `expectStreaming` / `expectReasoning` / `expectTools`: drive the pass/fail
  heuristics.

## Layout

- `runner.ts` — shared logic for both modes (`runHarness('streaming' | 'non-streaming')`).
- `runStreaming.ts` / `runNonStreaming.ts` — thin entry points per mode.
- `scenarios.mjs` — scenario matrix.
- `reporters/jsonlReporter.mjs` — writes `out/<ts>-<mode>.jsonl`.
