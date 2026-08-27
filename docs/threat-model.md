# ThoughtKeep Threat Model

This threat model was written before implementation began. Each threat is mapped to a specific control, and each control has a corresponding test in docs/security-evidence.md. Threats are grouped by the five zones named in the challenge: input surfaces, reasoning, tool execution, memory/state, and inter-system communication.

| # | THREAT | ZONE | CONTROL | TEST |
|---|---|---|---|---|
| 1 | User A reads User B’s journal | Memory/state | Firestore owner-bound rules + server-side UID from verified token | T1 |
| 2 | Direct prompt injection | Input | Model Armor injection filter + constitution directive 6 | T2 |
| 3 | Indirect injection via pasted content | Input | All content routed through the same gate, not just typed messages | T3 |
| 4 | Script injection / XSS | Output | Model output rendered as text, never HTML | T4 |
| 5 | Gemini key extracted from browser | Comms | Key held server-side, fetched from Secret Manager | T5 |
| 6 | Gemini key found in public repo | Comms | Key never written to any file; repo secret-scanned | T6 |
| 7 | Sensitive data sent to the model | AI | Sensitive Data Protection filter in Model Armor template + per-entry AI-processing flag | T7 |
| 8 | Harmful content in or out | Input/Output | Model Armor RAI filters, both directions | T8a–d |
| 9 | Forged identity in request body | Input | UID derived only from verified token; client-supplied UID ignored | T9 |
| 10 | Cost exhaustion / request flooding | Input | Per-user quota (200/day) + app-wide ceiling (2,000/day) + Cloud Run max-instances + budget alert | T10, T15 |
| 11 | Non-owner reaches the Watchtower | Tool execution | Owner UID checked server-side against the verified token; non-owners get “not found”, not “denied” | T13 |
| 12 | Watchtower exposes user journal content | Memory/state | Watchtower reads only `admin/metrics` aggregates; forbidden by design from querying `users/` for content | T14 |
| 13 | Reviewer code leaks publicly | Comms | Code held in Secret Manager; bypasses only the cost ceiling, never a data boundary — documented as a cost control, not a security control | — |
