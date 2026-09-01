# ThoughtKeep — Deliberate trade-offs

What was considered, decided against, and why.

A list of features is a claim about ambition. A list of things you chose not to
build, with reasons, is a claim about judgement. This is the second list.

---

## Sharing entries between users

**Not built, and not planned.**

ThoughtKeep's welcome screen makes a specific promise: *your entries are stored
where nobody else can read them — not even ThoughtKeep's owner.* Every sharing
feature is a hole in that sentence.

The moment entries can travel between accounts, the isolation guarantee becomes
conditional, the threat model needs rewriting, the Firestore rules need a second
access path, and the red-team suite needs re-running. What is currently a
structural property — there is no code that can read another user's entry —
would become a policy that code is trusted to honour.

Two users testing the app asked for this. The honest answer we gave them: if you
want to share a reflection, **Settings → Download my data** gives you everything
in plain JSON and you send it yourself. The person keeps control of what leaves.

## Location-tagged entries

**Location awareness was built. Storing location was deliberately not.**

ThoughtKeep already uses the browser's geolocation — but only in one place, only
after an explicit request, and only for as long as a single call takes. When
someone asks about the weather, coordinates are collected with consent, sent
once to the weather provider, and discarded. They are never written to Firestore,
never attached to an entry, never logged, and never sent to Gemini as ordinary
context. A test enforces that.

Pinning a location to every entry was considered and rejected. A journal that
records where you were, every time you wrote something, is a movement history —
and a movement history of a person's private reflections is a surveillance record
regardless of who holds it. It would be the single most sensitive field in the
database, and it would sit inside a product whose central promise is that the
person who runs it cannot learn anything about you.

The line we drew: **location may be used, in the moment, with consent. Location
may not be kept.** Using it to answer a question you asked is a service. Storing
it because it might be interesting later is surveillance, and the difference is
whether the data outlives the reason it was collected.

If it were built in v2, it would be per-entry and opt-in — the same governance
model already applied to AI processing and retention — never a default.

## A tools panel — calculator, expense tracking, finance

**Not built.**

A journal that also tracks expenses is not a better journal; it is two adequate
products where there was one good one. The pattern we chose instead is already
in the app: when the conversation implies a task, ThoughtKeep *suggests the right
Google tool* — Docs for drafting, Calendar for a deadline, Maps for a trip, Keep
for a list — rather than rebuilding a worse version of it.

Every suggestion URL is a fixed constant from a four-item allowlist. Nothing the
user writes is ever interpolated into a link, and matching runs on the user's own
message rather than the model's reply, so the model cannot summon a link by
mentioning a keyword.

## Image, video and file uploads

**Not built.**

Uploads would require Cloud Storage, malware scanning, image content screening
through Model Armor, and a new set of Firestore rules and retention semantics for
binary objects. The threat model names uploads explicitly as an input surface;
adding one without the corresponding controls would mean shipping a surface we
had not tested.

## Google Workspace integration — Docs, Calendar, Gmail

**Not built. This one is a scheduling constraint, not a design objection.**

Reading or writing a user's Workspace data requires sensitive OAuth scopes, and
those require Google's verification process — which takes weeks and needs a
privacy policy, a homepage and a recorded demonstration. There was no path to
completing that inside the build window.

The suggestion chips are the honest version of the same idea: they open the right
Google tool without ever requesting access to the person's account.

## Cloud Armor / WAF

**Not built.**

Cloud Armor protects a load balancer. ThoughtKeep is a single Cloud Run service
reached directly, so adding it would mean introducing a load balancer purely to
have something to attach a WAF to. The abuse vectors it would address are handled
closer to the application: authentication on every route, per-user and app-wide
quotas, and `max-instances` bounding worst-case spend.

## Gemini Live and Veo

**Not built.**

Both are impressive and neither serves the product. Live's real-time audio
conversation is a different interaction model from journaling, which benefits from
the pause between writing and reading. Veo generates video, and this is a place
for words.

Adding either would have been a demonstration of range rather than of judgement.

## A zero-knowledge encrypted vault

**Not built — and this is the most interesting omission.**

True zero-knowledge encryption would mean entries are encrypted in the browser
with a key the server never sees. It would be the strongest possible version of
ThoughtKeep's central promise.

It also breaks the product. If the server cannot read an entry, the server cannot
send it to Gemini, and an AI journal that cannot read your journal is a text
editor. It would also make password recovery equivalent to permanent data loss.

The honest position is the one we took: the server *can* read entries in order to
work, and the guarantee we actually make is narrower and true — no other user can
read them, and the owner has no code path to them. We say that plainly rather
than implying a stronger claim.

Documented in `docs/future-work.md` as a possible per-entry option rather than a
whole-product architecture.

## Cloud Run Sandbox / gVisor

**Not built.**

Second-generation sandboxing protects against untrusted code executing inside the
container. ThoughtKeep executes no user-supplied code — model output is rendered
as text and never evaluated — so the threat it defends against does not exist
here. Enabling it would have added startup latency and a plausible-sounding line
in the README, which is exactly the wrong reason to enable something.

## Quotas fail OPEN, unlike every other control

**A deliberate inconsistency.**

Every security control in ThoughtKeep fails closed: if it cannot complete, the
action is denied. Quotas do the opposite — if the counter store is unreachable,
the message proceeds.

A quota is a cost control, not a security boundary. Failing closed there would
mean a metering outage takes the whole application down to protect a billing
safeguard. The asymmetry is intentional and is commented in `server/quota.ts` so
it reads as a decision rather than an oversight.

## Model Armor in us-central1 while everything else is in Asia

**Accepted latency cost.**

The Model Armor template lives in `us-central1` because `asia-south1` did not
offer the full filter set, notably Malicious URI. Every screening call therefore
crosses regions and adds latency to every message.

Complete filter coverage was judged more valuable than a faster round trip for a
security-focused product. The cost is masked in the interface rather than hidden:
the user sees a screening indicator instead of a motionless screen.

## Animation and interaction effects

**Declined during user testing.**

Both testers asked for visual effects on scroll, typing and responses.

ThoughtKeep's tone is a quiet room for difficult thoughts. Motion on every
keystroke makes an application feel busy, which is the opposite of what someone
wants while processing a hard day. There is also an accessibility cost: motion
causes discomfort for some people, and doing it properly means honouring
`prefers-reduced-motion` everywhere.

The one place motion genuinely helps is already there — replies stream in.

## Persisting unsaved drafts

**Not built, deliberately.**

Signing out mid-conversation discards the unsaved reflection. This looks like a
gap and is a choice: persisting drafts would mean writing unscreened, unsaved
text to the database automatically, without the person deciding to keep it.

Save is an explicit act. Nothing is stored until the person says so.
