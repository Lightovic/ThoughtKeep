# ThoughtKeep

A private, secure, AI-powered reflection journal built on Google Cloud, Firebase, and Gemini.

---

## Security Architecture & Key Management

### Firebase Browser Web API Key vs. Server-Side Gemini API Key

This application uses two distinct types of keys with strictly segregated trust domains:

1. **Firebase Web API Key (Client-Side)**
   - Located in `firebase-applet-config.json` and bundled in the client application.
   - **Purpose**: Identifies the Firebase project (`true-rampart-464602-i0`) to Google Cloud backend infrastructure; it does **not** grant authorization or bypass security controls.
   - **Authorization**: Access to private user data is controlled exclusively by **Firebase Authentication** and **Firestore Security Rules** (`firestore.rules`). An unauthenticated or unauthorized request using this key will be rejected by Firestore.
   - **Restriction**: In Google Cloud Console, this API key is restricted by API scope (Firebase Auth, Firestore) and HTTP referrer to prevent unauthorized usage.

2. **Gemini API Key (Server-Side Only)**
   - Kept strictly in server-side runtime memory and accessed via `process.env.GEMINI_API_KEY`.
   - **Zero Client Exposure**: The Gemini API key is never bundled in frontend JavaScript, never sent to the browser, and never logged in audit trails.
   - All AI interactions pass through authenticated, server-side Express endpoints (`/api/chat/stream`, `/api/chat/summarize`) guarded by `requireAuth` and screening choke points.

---

## Database Configuration & Security Rules

- **Active Database**: The client application connects directly to the `(default)` Firestore database of the Firebase project `true-rampart-464602-i0`.
- **Enumerated Security Rules**: Security rules in `firestore.rules` enumerate all active database paths explicitly without overlapping wildcards:
  - `users/{userId}`: User profile document (owner read/write).
  - `users/{userId}/entries/{entryId}`: Journal entries (owner read/write).
  - `users/{userId}/usage/{docId}`: Usage counters (owner read-only, client write forbidden).
  - `users/{userId}/securityEvents/{eventId}`: Audit trail (owner read-only, client write forbidden).
  - `admin/{docId}`: Administrative metrics (read-only for the designated admin UID, client write forbidden).
  - `/{document=**}`: Default deny.
- **Administrative UID Configuration**: The `isAdmin()` function in `firestore.rules` contains the placeholder `'REPLACE_WITH_OWNER_UID'`. This must be replaced with the project owner's real Firebase Auth UID before any administrative read access functions. Leaving it as the placeholder fails safe by matching nobody.

---

## Core Security Controls

- **Cryptographic Token Verification**: ID tokens issued by Google Sign-In are cryptographically verified using Firebase Admin SDK against Google's public certificates.
- **Fail-Closed AI Processing Boundary**: The user can flag any journal reflection with "Never send this entry to AI", completely excluding the content from Gemini model context, screening choke points, and automated summaries.
- **Screening Choke Points**: All inbound user content and outbound AI model responses pass through centralized `screenInbound` and `screenOutbound` choke points.
- **Content Security Policy**: Strict CSP headers prevent XSS, foreign object injection, and unauthorized network egress.
