# Consistency: what is done and what is not guaranteed

Techniques: locked, versioned character and location descriptors injected in a fixed order (prompt compiler); approved reference images attached
within the provider's limit, chosen by shot size; keyframe-first generation; optional vision scoring of each keyframe against the
reference sheet and the location plate with retry and best-of selection.

Not guaranteed: scores are model heuristics, not measurements, and the UI labels them so. A shot below the threshold after the allowed attempts is kept
(best attempt) and flagged. Clip chaining (last frame to next first frame) is not implemented. Provider identity training handles are stored but unused.
Quality with real models is unverified; all automated tests use fakes and mocks.
