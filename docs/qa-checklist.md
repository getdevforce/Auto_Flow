# Manual QA checklist

Everything here could not be fully verified in the build sandbox (no real provider keys, no Chrome Web Store, no live billing, no MySQL server).

## Provider adapters (need real keys)
- [ ] Anthropic: Test connection; script analysis with `output_config.format`; confirm whether `anthropic-dangerous-direct-browser-access` is needed from an extension origin.
- [ ] OpenAI: image generation response shape (`b64_json`), current image model id, moderation error code.
- [ ] fal.ai: confirm queue URLs, input field names per chosen video and upscale model, CORS from the extension, key-test probe behaviour.
- [ ] ElevenLabs: response format, error shape, voices endpoint.
- Adapter headers say what was verified on 2026-10-03; sections marked UNCONFIRMED in `docs/provider-notes.md` must be checked first.

## Other
- [ ] Real upscaling quality; Chrome Web Store packaging; live billing (Paddle availability for Pakistan); MySQL 8 migration run; Larastan level 8 (CI only).
