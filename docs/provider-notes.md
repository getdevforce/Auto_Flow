# Provider API notes (browser / service-worker, user-supplied key)

Verified: 2026-10-03.

## Verification status (read first)

The research sandbox blocks outbound fetches to every host except `platform.claude.com`.
Blocked: docs.anthropic.com, platform.openai.com, developers.openai.com, fal.ai, docs.fal.ai,
elevenlabs.io, docs.dev.runwayml.com, replicate.com. WebSearch works but returns only short
snippets.

Tags used below:
- [CONFIRMED] = read on the official page this session (URL given).
- [SNIPPET] = taken from an official-site search snippet only. Details are thin.
- [UNCONFIRMED] = from prior knowledge, NOT verified today. Re-check before relying on it.

Sections 2 to 5 are mostly [UNCONFIRMED]. Open each official page and confirm before coding.

---

## 1. Anthropic Messages API  [CONFIRMED unless noted]

Sources:
- https://platform.claude.com/docs/en/api/overview
- https://platform.claude.com/docs/en/api/messages (via fetch)
- https://platform.claude.com/docs/en/api/errors
- https://platform.claude.com/docs/en/api/models/list
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons

### Endpoint and headers
- Base URL: `https://api.anthropic.com`
- `POST /v1/messages`
- Required headers:
  - `anthropic-version: 2023-06-01`
  - `content-type: application/json`
  - Auth: `x-api-key: <key>` (documented as a "legacy fallback", still supported) OR
    `Authorization: Bearer <key>`. The overview now lists `Authorization` first, and says
    `x-api-key` is required only when `Authorization` is not set.
- `anthropic-workspace-id` is optional for single-workspace keys. It is required for a
  multi-workspace key.
- Browser access: header `anthropic-dangerous-direct-browser-access: true` is needed to
  enable CORS for direct browser calls.
  - [SNIPPET] only. Source: https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
  - It was not found on the official pages fetched today, so there is no official doc
    confirmation. Without it the API rejects browser-origin requests.
  - Implication: send it from the extension or service worker. A custom header triggers a
    CORS preflight (OPTIONS), which Anthropic is documented, via third-party reports, to
    answer when this header is present.
- Request size limit: 32 MB for Messages. Over the limit returns 413 `request_too_large`.

### Model IDs (all CONFIRMED on the models overview)
| Model | API ID | Alias | Notes |
|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | same | $10/$50 per MTok |
| Claude Opus 5.5 | `claude-opus-5-5` | same | $4/$20, 1M ctx, 128K out |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | same | $2/$10, 1M ctx, 128K out |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | $1/$5, 200K ctx, 64K out |

- All three IDs the task asked about are confirmed.
- Haiku 4.5 retirement: "not sooner than October 15, 2026". That is 12 days after the
  verification date. It is a lower bound, not a firm date, but treat Haiku as at risk and
  make the model ID user-configurable.
- Also exists (legacy, still available): `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`,
  `claude-opus-4-8`, `claude-sonnet-4-6`.
- Other doc pages in this session show `claude-sonnet-5` in curl examples.

### Model quirks that matter for this app
- Opus 5.5 and Sonnet 5.5 REJECT forced tool use. `tool_choice: {"type":"any"}` or
  `{"type":"tool",...}` returns 400 `invalid_request_error`: `tool_choice: type "tool" and
  "any" are not supported for this model.`
  - Only `auto` (default) and `none` are accepted.
  - Do NOT use the "force one tool, read tool_use.input" JSON trick on these models.
- Prefill (a trailing assistant message) is unsupported on Claude 4.6 and later. It returns 400.
- Thinking: Opus 5.5 is always on (adaptive). `thinking: {"type":"disabled"}` returns 400.
  - Sonnet 5.5: use `{"type":"between_tools"}` for the lowest thinking, or omit the field
    (adaptive).
  - Haiku 4.5: extended thinking only (`enabled` + `budget_tokens`), no adaptive.
  - Simplest approach: omit `thinking`.
- Thinking blocks come back in `content[]`. When extracting JSON, take the `text` block, not
  `content[0]`.
- Default effort: Opus 5.5 `medium`, Sonnet 5.5 `high`. Set via `output_config.effort`.
  Haiku has no effort parameter.

### JSON / structured output
- GA, no beta header: `output_config.format = {"type":"json_schema","schema":{...}}`.
  - The response text is JSON matching the schema.
  - Supported: object, array, string, integer, number, boolean, null, enum, const, anyOf,
    allOf, string formats such as date-time/date/email/uri/uuid, `required`,
    `additionalProperties:false`, `minItems` 0 or 1.
  - NOT supported: min/max numeric constraints, minLength/maxLength, external `$ref`,
    complex nested arrays.
  - Old param `output_format` needs beta header `structured-outputs-2025-11-13`. Deprecated.
- Alternative: `tools[].strict: true` with `tool_choice: auto`. This guarantees valid tool
  input but the model may not call the tool.
- The models list exposes `capabilities.structured_outputs.supported`. Check it per model.
- Haiku 4.5 structured-output support: [UNCONFIRMED] for the exact schema feature set.
  Check `GET /v1/models`.

### Prompt caching
- Top-level `"cache_control": {"type":"ephemeral"}` on the request gives automatic
  breakpoint placement. Or put `cache_control` on a system / content block (explicit).
- TTL: default 5m. Optional `"ttl":"1h"` (write cost 2x base).
- Minimum cacheable prefix: 512 tokens (Opus 5.5, Sonnet 5.5), 4,096 tokens (Haiku 4.5).
- Reads: 0.05x base on Opus 5.5, 0.1x on others. Writes: 1.25x (5m).
- Usage fields: `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`.
- Cache order: tools, then system, then messages. Changing tools invalidates everything.
  Changing images invalidates the message level only.

### Image input
- Content block `{"type":"image","source":{...}}`. Source types:
  - `{"type":"base64","media_type":"image/jpeg|png|gif|webp","data":"<b64, no data: prefix>"}`
  - `{"type":"url","url":"https://..."}`
  - `{"type":"file","file_id":"..."}` (Files API)
- Limits: 10 MB per image (base64) on the direct API. Max 8000x8000 px. If a request has
  more than 20 images, each image is limited to 2000 px per side. Up to 600 images per request
  (100 on 200K-context models, so Haiku).
- Claude 4.7+ downscales to a max long edge of 2576 px. Haiku 4.5 downscales to 1568 px.
- Place images before the text for best results. Label multiple images "Image 1:", etc.
- Claude cannot generate or edit images. It only analyzes them.

### Errors and status codes
Response shape (JSON, always):
`{"type":"error","error":{"type":"<code>","message":"..."},"request_id":"req_..."}`
The same ID is in the `request-id` response header.

| HTTP | error.type |
|---|---|
| 400 | `invalid_request_error`. Also returned when a workspace or org spend limit is hit. |
| 401 | `authentication_error` (bad, revoked or expired key) |
| 402 | `billing_error` |
| 403 | `permission_error` |
| 404 | `not_found_error` (also unknown model) |
| 409 | `conflict_error` |
| 413 | `request_too_large` (Cloudflare may answer before the API) |
| 429 | `rate_limit_error`. Honor the `retry-after` header. A monthly-tier spend-cap 429 has NO `retry-after` and keeps failing, so do not retry it. |
| 500 | `api_error` |
| 504 | `timeout_error` |
| 529 | `overloaded_error` (back off and retry) |

- Refusals / policy: a model refusal is NOT an HTTP error. It is HTTP 200 with
  `stop_reason: "refusal"` and a `stop_details` field naming the policy category. Code must
  check `stop_reason`. A 400 is for malformed requests, not for content refusals.
- Other `stop_reason` values: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`,
  `pause_turn`, `model_context_window_exceeded`.
- Errors can also arrive mid-stream after a 200 when streaming (SSE `error` event).
- Non-streaming requests that may exceed about 10 minutes should stream. Service-worker
  lifetime also matters here.

### Cheapest key test
- `GET https://api.anthropic.com/v1/models?limit=1` with `anthropic-version`, the auth header,
  and the browser header. No tokens billed.
  - 200 means the key is valid. 401 means invalid.
  - Response: `{data:[{id,display_name,created_at,max_input_tokens,max_tokens,capabilities}],
    first_id,last_id,has_more}`. Newest models first. `limit` 1 to 1000 (default 20).
  - Use the same call to list which model IDs the key can access.
- Alternative: `POST /v1/messages/count_tokens` (free, tests model access) [UNCONFIRMED
  free pricing today; it is documented as an endpoint].

---

## 2. OpenAI-compatible APIs  [mostly UNCONFIRMED]

Sources attempted (blocked in the sandbox): https://platform.openai.com/docs/api-reference ,
https://developers.openai.com/api/reference/resources/images/methods/generate
(appeared in search results, so the page exists).

### Chat completions [UNCONFIRMED, stable for years]
- `POST {base}/v1/chat/completions`, headers `Authorization: Bearer <key>`,
  `Content-Type: application/json`.
- Body: `{model, messages:[{role,content}], temperature?, max_tokens | max_completion_tokens?,
  response_format?: {type:"json_object"} | {type:"json_schema", json_schema:{name,schema,strict}},
  stream?}`.
  - Newer reasoning models take `max_completion_tokens`, not `max_tokens`.
- Response: `{id, choices:[{index, message:{role,content}, finish_reason}], usage:{prompt_tokens,
  completion_tokens,total_tokens}}`.
- Image input: `content:[{type:"text",text},{type:"image_url",image_url:{url:"data:image/png;base64,..."}}]`.
- Key test: `GET {base}/v1/models` returns `{object:"list", data:[{id,...}]}`. 401 means a bad key.
- Error shape: `{"error":{"message","type","param","code"}}`.
  - 401 `invalid_api_key`, 429 `rate_limit_exceeded` / `insufficient_quota`, 400 for bad params.
- Browser CORS: OpenAI's API generally answers CORS preflight for `Authorization` headers
  [UNCONFIRMED]. Test with a real call. Third-party "OpenAI-compatible" hosts vary. The user
  must supply the base URL, and each host needs a CORS check.

### Images: /v1/images/generations
- [SNIPPET] (developers.openai.com search result): GPT image models ALWAYS return base64 in
  `data[].b64_json`. `response_format` is deprecated for them and `url` is not supported.
  Params seen: `size` (WxH, e.g. 1024x1024), `quality` (low / medium / high),
  `moderation` (`low` or `auto`).
- [UNCONFIRMED] Model name: `gpt-image-1` was current at my last knowledge. A newer
  `gpt-image-*` may exist as of Oct 2026. I could NOT confirm the current name, so keep the
  model ID user-configurable and default from the live docs.
- [UNCONFIRMED] Other params: `n`, `output_format` (png|jpeg|webp), `background`
  (transparent|opaque|auto), `output_compression`.
  - Edits (image-to-image with a reference): `POST /v1/images/edits`, multipart/form-data,
    `image[]` file(s) plus `prompt`.
- [UNCONFIRMED] Content-policy rejection: HTTP 400 with `error.code` of
  `content_policy_violation` or `moderation_blocked`, and `error.type` of
  `image_generation_user_error`. I could not confirm the exact code string. Treat any 400
  whose code or message contains "moderation" or "policy" or "safety" as a policy block.
- Note: API org verification may be required for GPT image models [UNCONFIRMED].

---

## 3. Video generation with image-to-video + polling  [UNCONFIRMED]

Could not fetch any video provider's official docs (all blocked). Search snippets only.

Recommended pick: Runway, based on what I know of its docs being the clearest. But CORS is a
real risk, see below.

### Runway [SNIPPET + UNCONFIRMED]
Sources: https://docs.dev.runwayml.com/guides/using-the-api/ ,
https://docs.dev.runwayml.com/api-details/sdks/ (appear in search results; not fetched).
- [SNIPPET] `POST /v1/image_to_video`. Params include `promptImage`, `promptText`, `ratio`,
  `duration`, model e.g. `gen4.5` (the search result mentions Gen-4.5 as current).
- [SNIPPET] SDK helper `waitForTaskOutput` polls a returned task. The polling model is tasks.
- [UNCONFIRMED] Base `https://api.dev.runwayml.com/v1`.
  - Headers: `Authorization: Bearer <key>`, `X-Runway-Version: 2024-11-06` (version date
    may have moved).
  - Create returns `{id}`. Poll `GET /v1/tasks/{id}`.
  - Status values: `PENDING`, `THROTTLED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.
  - On success, `output: [url,...]`. These are signed, short-lived CDN URLs, so download
    promptly.
  - `promptImage` accepts an HTTPS URL or a data URI.
  - `ratio` is in "W:H" pixel form (e.g. `1280:720`, `720:1280`). `duration` is typically 5 or
    10 (model-dependent).
  - Errors: 400 validation, 401, 429 rate limit, task `failure` / `failureCode` fields.
- CORS: [UNCONFIRMED] Runway's API is designed for server use. Runway is known to not send
  permissive CORS headers for browser origins. Assume a direct browser call may FAIL and plan
  a fallback (see below).

### fal.ai queue [SNIPPET + UNCONFIRMED]
Sources: https://fal.ai/docs/model-apis/model-endpoints/queue ,
https://docs.fal.ai/model-apis/model-endpoints (search results only).
- [SNIPPET] Asynchronous queue is the recommended mode. Submit, then poll status, or use a
  webhook. The submit response has `request_id`, `response_url`, `status_url`, `cancel_url`,
  `queue_position`. Status values IN_QUEUE (with `position`) and IN_PROGRESS (with `logs`).
  Fetch the result after COMPLETED.
- [UNCONFIRMED] URL pattern:
  - `POST https://queue.fal.run/{model_path}` (e.g. `fal-ai/kling-video/.../image-to-video`)
  - `GET https://queue.fal.run/{model_path}/requests/{request_id}/status`
  - `GET .../requests/{request_id}` for the result, `PUT .../cancel`
  - Auth: `Authorization: Key <FAL_KEY>`
  - Per-model input schema varies (e.g. `image_url`, `prompt`, `duration`, `aspect_ratio`).
  - Result is JSON like `{video:{url}}`.
- fal publishes a client-side proxy pattern because exposing keys in the browser is discouraged.
  Whether `queue.fal.run` answers CORS preflight for a user key is [UNCONFIRMED]. This is
  the more likely provider to work from a browser, but test it.

### Not researched
- Luma and Replicate. replicate.com was blocked. [UNCONFIRMED]: Replicate's API is
  `POST https://api.replicate.com/v1/predictions` with `Authorization: Bearer`, and statuses
  `starting|processing|succeeded|failed|canceled`. Historically it has no browser CORS
  support.

### CORS fallback if the provider blocks browser calls
- Test with one real request from the extension service worker. Extension service workers
  with `host_permissions` for the provider origin are NOT subject to page CORS, so this
  usually works in a Chrome MV3 extension.
  - Add the provider origin to `host_permissions` in manifest.json.
  - This is standard Chrome extension behavior [UNCONFIRMED against current Chrome docs].
- Otherwise a user-run proxy is needed. That is a design decision for the caller.

---

## 4. ElevenLabs text-to-speech  [SNIPPET + UNCONFIRMED]

Sources (search results only; fetch blocked):
https://elevenlabs.io/docs/api-reference/text-to-speech/convert ,
https://elevenlabs.io/docs/api-reference/voices/get

- [SNIPPET] `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`.
  - Header `xi-api-key: <key>`.
  - Query `output_format`, default `mp3_44100_128`.
  - Body requires `text`. `model_id` optional, must support TTS; list models with
    `GET /v1/models`.
- [SNIPPET] `GET /v1/voices/{voice_id}` returns voice metadata.
- [UNCONFIRMED] Details:
  - Response is the raw audio bytes (`audio/mpeg` for mp3). Read it as a Blob or ArrayBuffer,
    not JSON.
  - Other formats: `mp3_44100_192`, `pcm_16000`, `pcm_22050`, `pcm_24000`, `pcm_44100`,
    `ulaw_8000`, etc. Some need a higher plan tier.
  - Model IDs: `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`; a newer
    v3 exists. The current default is unconfirmed.
  - Optional body: `voice_settings` (stability, similarity_boost, style, use_speaker_boost,
    speed), `language_code`, `seed`, `previous_text` / `next_text`.
  - Voices list for key test: `GET /v1/voices` (a `/v2/voices` also exists). 401 means a bad key.
    A cheaper test is `GET /v1/user`, which may need the `user_read` permission on restricted
    keys. Prefer `/v1/voices` or `/v1/models`.
  - Error shape: 4xx with `{"detail":{"status":"...","message":"..."}}`.
    422 validation returns `detail:[{loc,msg,type}]`. 401 `invalid_api_key`, 429 concurrency or
    rate limit.
  - Streaming variant: `POST /v1/text-to-speech/{voice_id}/stream`.
  - Browser CORS: ElevenLabs is widely used from browsers with `xi-api-key`, so CORS is
    permitted [UNCONFIRMED but strongly expected].

---

## 5. Upscale API with REST job polling  [UNCONFIRMED]

No official upscale docs could be fetched.

- Candidate A, fal.ai: reuses the same queue pattern as section 3 (`queue.fal.run`,
  `Authorization: Key`). Video and image upscaler models are hosted (e.g. Topaz-based and
  other upscalers), but the exact model paths, params and scale factors are [UNCONFIRMED].
  Typical image input fields: `image_url`, `scale` / `upscale_factor`. Video: `video_url`,
  `upscale_factor`.
- Candidate B, Runway: [SNIPPET] third-party result (useapi.net) mentions "Topaz 4K upscale"
  as available through Runway. Official Runway endpoint (`POST /v1/video_upscale`, tasks
  polling, upscale to 4K) is [UNCONFIRMED].
- Candidate C, Topaz Labs API: not researched.
- Recommendation: use the same provider as the video step (fal.ai) so there is one key, one
  queue and one polling implementation. Confirm the specific model's schema on its fal.ai
  model page before coding.

---

## Open items to confirm before coding
1. Official doc statement for `anthropic-dangerous-direct-browser-access` (only third-party
   sources found).
2. Current OpenAI image model name, supported `size` values and the exact content-policy error
   code.
3. Whole of section 3 (create or poll shapes, statuses, ratio/duration enums) and CORS
   behavior from an extension service worker.
4. ElevenLabs current default model, error shape, `output_format` list.
5. Upscale model, params and factors.
6. Haiku 4.5 retirement on or after Oct 15, 2026. Re-check
   https://platform.claude.com/docs/en/about-claude/model-deprecations.
