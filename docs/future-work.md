# ThoughtKeep — Future work

The v2 roadmap. Ordered by the value each would add, not by how easy it would be.

---

## 1. Semantic memory search

Ask *"what was I anxious about in August?"* and get an answer drawn from your own
entries.

The reason this is first: the value of a journal compounds with its length, and
right now ThoughtKeep gives you no way to reach back into it. History is a list.

The hard part is not search — it is that search must honour the per-entry
AI-processing boundary. An entry marked *never send to AI* must be invisible to
embedding, indexing and retrieval, not merely filtered out of the results. That
means the boundary has to be enforced at index time, and the index itself becomes
data with a retention policy. Firestore Vector Search is the likely foundation.

## 2. Saved personal prompts

One-tap prompts a person defines for themselves — *"tell me something to think
about today"*, *"help me plan tomorrow"*, *"make me laugh"*.

Suggested by a user during Phase 7 testing. Deferred because it arrived after
feature freeze, not because it lacked merit. It is the first thing on this list
that could ship in an afternoon.

## 3. Per-entry encrypted vault

Not whole-product zero-knowledge encryption — that breaks an AI journal, as
`docs/trade-offs.md` explains. Instead: mark a *single entry* as vaulted, and it
is encrypted in the browser with a key derived from a passphrase the server never
sees.

Such an entry could never be read by the AI, summarised, or searched. It would be
the strongest version of *never send to AI*: not a policy the server honours, but
a fact the server cannot change. The honest trade-off — losing the passphrase
means losing the entry — would be stated plainly at the moment of choosing it.

## 4. Scheduled reflection prompts

An optional nudge at a chosen time: *"a quiet moment — anything you want to put
down?"* Journaling fails on consistency far more often than on features.

Cloud Scheduler plus Firebase Cloud Messaging. The design constraint is restraint:
one notification, at a time the person chose, easy to turn off. A journal that
nags is a journal people delete.

## 5. Workspace integration, after OAuth verification

Draft an entry into a Google Doc; turn a mentioned deadline into a real Calendar
event. Currently ThoughtKeep can only *point* at these tools, because writing to
them needs sensitive OAuth scopes and Google's verification process.

That verification is a matter of weeks and paperwork rather than engineering, and
it was not available inside the build window.

## 6. Richer media

Photographs attached to an entry — the sight of a day alongside the account of it.

This needs the full input pipeline first: Cloud Storage, malware scanning, image
screening through Model Armor, retention semantics for binary objects, and a
threat model extended to cover them. It is a phase of work, not a feature.

## 7. Self-hosting

ThoughtKeep's promise is that the owner cannot read your journal. The strongest
version of that promise is that *you* are the owner.

A documented single-command deployment into someone's own Google Cloud project,
with their own Firestore, their own keys and their own Watchtower. The security
model already supports it; what is missing is the packaging and the documentation
to make it genuinely followable.

---

## Explicitly not planned

- **User-to-user sharing** — see `docs/trade-offs.md`. It contradicts the central guarantee.
- **A tools panel** — a journal that does expense tracking is two adequate products.
- **Whole-product zero-knowledge encryption** — an AI journal that cannot read your journal is a text editor.
