# Autopilot: how it works and what it cannot promise

## Stages
S0 import (.txt .md .fountain .docx) -> S1 analysis -> S2 characters (portraits, reference sheet, lock) -> S3 environments (plates, lock)
-> S4 shot planning -> S5 prompt refinement -> S6 keyframes (scored) -> S7 video -> S8 upscale -> S9 ordered download + manifest
-> S11 report. S10 audio (voice synthesis) has adapters but is not wired into the run yet.

Every stage reads what already exists before creating anything, so resuming after a crash never repeats finished work. Provider jobs
store their provider job id before polling; LLM answers are cached by input hash.

## Autonomy
Manual waits at every stage. Checkpoints waits at characters, locations and the pilot scene (first scene's keyframes). Full auto never
waits; every automatic pick is written to the decision log shown in the run view.

## Safety
Budget cap (estimates from the prices you enter; in-flight jobs are reserved against the cap), circuit breaker (5 consecutive failures across
different shots, or any auth/quota error), per-provider pacing that halves on 429. One shot failing repeatedly counts once.

## Failure policy per shot
retry -> retry with the original wording -> next model in the fallback chain (if enabled) -> flag and continue. Policy rejections are flagged at
once with the provider's reason and a suggested clearer rewrite; nothing is retried to get around moderation.

## Honest limits
- Runs only while Chrome is open; after sleep or restart it reconciles in-flight jobs and continues.
- Draft-then-upscale enlarges a low-resolution clip. It cannot add real detail. The local fallback is a Lanczos resize, not AI upscaling.
- Identity consistency depends on the image and video models. Reference sheets are generated from text unless the provider accepts reference images.
- Everything above was exercised against mock providers. No real provider was called; see docs/qa-checklist.md.
- Videos are downloaded through an offscreen-document blob URL. Very large clips have not been tested.
