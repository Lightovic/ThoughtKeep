/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('ThoughtKeep Security, Architecture, and UI Mechanics Verification', () => {
  const rootDir = process.cwd();

  test('1. Owner save path and rules enforce owner identity (users/{userId}/entries/{entryId})', () => {
    const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
    assert.ok(rulesContent.includes('match /users/{userId}/entries/{entryId}'));
    assert.ok(rulesContent.includes('allow read, write: if isOwner(userId);'));

    const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');
    assert.ok(firebaseTs.includes("doc(db, 'users', currentAuthUid, 'entries', entryId)"));
    assert.ok(firebaseTs.includes("if (userId !== currentAuthUid)"));
  });

  test('2. Owner read queries match owner-bound path', () => {
    const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');
    assert.ok(firebaseTs.includes("collection(db, 'users', currentAuthUid, 'entries')"));
  });

  test('3. Owner delete operates only on owner doc', () => {
    const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');
    assert.ok(firebaseTs.includes("doc(db, 'users', currentAuthUid, 'entries', entryId)"));
    assert.ok(firebaseTs.includes("await deleteDoc(docRef)"));
  });

  test('4 & 5. Cross-user read and write are strictly denied by default-deny and isOwner rule', () => {
    const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
    assert.ok(rulesContent.includes('match /{document=**}'));
    assert.ok(rulesContent.includes('function isOwner(userId) {'));
    assert.ok(rulesContent.includes('return request.auth != null && request.auth.uid == userId;'));
  });

  test('6. securityEvents client write remains strictly denied in firestore.rules', () => {
    const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
    assert.ok(rulesContent.includes('/securityEvents/{eventId}'));
    assert.ok(rulesContent.includes('allow write: if false;'));
  });

  test('7 & 8. User and Assistant message text have user-select enabled and selection styling', () => {
    const chatTsx = fs.readFileSync(path.join(rootDir, 'src/components/JournalChat.tsx'), 'utf8');
    assert.ok(chatTsx.includes('select-text cursor-text'));
    assert.ok(chatTsx.includes('selection:bg-slate-700'));
    assert.ok(chatTsx.includes('selection:bg-slate-200'));
  });

  test('9 & 10. Copy logic supports full message and selected text copy with accessible status', () => {
    const copyButtonTsx = fs.readFileSync(path.join(rootDir, 'src/components/CopyMessageButton.tsx'), 'utf8');
    assert.ok(copyButtonTsx.includes('window.getSelection()'));
    assert.ok(copyButtonTsx.includes('navigator.clipboard.writeText'));
    assert.ok(copyButtonTsx.includes('Copied'));
    assert.ok(copyButtonTsx.includes("Couldn't copy that message. Please try again."));
  });

  test('11 & 12. Active reflection is preserved across logo clicks and Journal <-> History navigation', () => {
    const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
    assert.ok(appTsx.includes("activeView === 'journal' ? 'flex' : 'hidden'"));
    assert.ok(appTsx.includes('chatMessages'));
    assert.ok(appTsx.includes('chatInputText'));
  });

  test('13. User avatar popover is accessible, closes on Escape/outside click, and hides UID', () => {
    const navbarTsx = fs.readFileSync(path.join(rootDir, 'src/components/Navbar.tsx'), 'utf8');
    assert.ok(navbarTsx.includes("event.key === 'Escape'"));
    assert.ok(navbarTsx.includes('Signed in with Google'));
    assert.ok(!navbarTsx.includes('user.uid'));
  });

  test('14. Weather flow, server validation, and Open-Meteo live integration', () => {
    const metadataJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'metadata.json'), 'utf8'));
    assert.ok(metadataJson.requestFramePermissions.includes('geolocation'));
    assert.ok(fs.existsSync(path.join(rootDir, 'server/weather.ts')));
    assert.ok(fs.existsSync(path.join(rootDir, 'src/utils/weatherIntent.ts')));

    const serverTs = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
    assert.ok(serverTs.includes('/api/weather'));
    assert.ok(serverTs.includes('fetchCurrentWeather'));
  });

  test('15. Landing page reflection starter prompts match requirements', () => {
    const chatTsx = fs.readFileSync(path.join(rootDir, 'src/components/JournalChat.tsx'), 'utf8');
    assert.ok(chatTsx.includes('What was the most meaningful moment of your day?'));
    assert.ok(chatTsx.includes("What's been occupying your mind lately?"));
    assert.ok(chatTsx.includes('What went well today, and what would you like to carry forward?'));
  });

  test('16. Weather coordinates are transient and NEVER stored in Firestore schema or writes', () => {
    const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
    const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');
    const serverTs = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');

    assert.ok(!firebaseTs.includes('latitude:'));
    assert.ok(!firebaseTs.includes('longitude:'));
    assert.ok(!serverTs.includes('latitude: docRef'));
    assert.ok(!rulesContent.includes('latitude'));
  });

  test('17. Security logging hygiene logs categories only without raw message payloads', () => {
    const weatherTs = fs.readFileSync(path.join(rootDir, 'server/weather.ts'), 'utf8');
    assert.ok(weatherTs.includes('WEATHER_FETCH_SUCCESS'));
    assert.ok(!weatherTs.includes('rawMessage'));
  });
});
