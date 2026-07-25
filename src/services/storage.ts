import { openDB, DBSchema } from 'idb';
import { UserProfile, SessionResult, ValidationCapture, PreTestContext, RecallTestResult } from '@/types';
import { selectTodayPreContext } from './preTestContext';
import { needsReprocessing, reprocessCapture, type ReprocessSummary } from './captureReprocess';

interface LinhaFixaDB extends DBSchema {
  profile: {
    key: string;
    value: UserProfile;
  };
  consent: {
    key: string;
    value: { acceptedAt: number };
  };
  sessions: {
    key: string;
    value: SessionResult;
    indexes: { 'by-date': number };
  };
  validationCaptures: {
    key: string;
    value: ValidationCapture;
    indexes: { 'by-date': number };
  };
  recallTests: {
    key: string;
    value: RecallTestResult;
    indexes: { 'by-date': number };
  };
}

const DB_NAME = 'linhafixa_db';
const DB_VERSION = 3;

export async function initDB() {
  return openDB<LinhaFixaDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile');
      }
      if (!db.objectStoreNames.contains('consent')) {
        db.createObjectStore('consent');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('by-date', 'timestamp');
      }
      if (!db.objectStoreNames.contains('validationCaptures')) {
        const captureStore = db.createObjectStore('validationCaptures', { keyPath: 'id' });
        captureStore.createIndex('by-date', 'timestamp');
      }
      if (!db.objectStoreNames.contains('recallTests')) {
        const recallStore = db.createObjectStore('recallTests', { keyPath: 'id' });
        recallStore.createIndex('by-date', 'timestamp');
      }
    },
  });
}

export async function saveProfile(profile: UserProfile) {
  const db = await initDB();
  await db.put('profile', profile, 'current_user');
}

export async function getProfile(): Promise<UserProfile | undefined> {
  const db = await initDB();
  return db.get('profile', 'current_user');
}

export async function saveConsent() {
  const db = await initDB();
  await db.put('consent', { acceptedAt: Date.now() }, 'status');
}

export async function hasConsent(): Promise<boolean> {
  const db = await initDB();
  const consent = await db.get('consent', 'status');
  return !!consent;
}

export async function saveSession(session: SessionResult) {
  const db = await initDB();
  await db.put('sessions', session);
}

export async function getSessions(): Promise<SessionResult[]> {
  const db = await initDB();
  return db.getAllFromIndex('sessions', 'by-date');
}

// Prefill helper: the latest pre-test context saved today, so a second test in the
// same day starts from the morning's answers instead of asking everything again.
// Both record sources count — the /assessment flow only ever writes captures.
export async function getTodayPreContext(): Promise<PreTestContext | null> {
  const [sessions, captures] = await Promise.all([getSessions(), getValidationCaptures()]);
  return selectTodayPreContext([
    ...sessions.map(s => ({ timestamp: s.timestamp, context: s.contextBefore })),
    ...captures.map(c => ({ timestamp: c.timestamp, context: c.context })),
  ]);
}

export async function saveValidationCapture(capture: ValidationCapture) {
  const db = await initDB();
  await db.put('validationCaptures', capture);
}

// Most-recent-first, so the review list shows the latest capture on top.
export async function getValidationCaptures(): Promise<ValidationCapture[]> {
  const db = await initDB();
  const captures = await db.getAllFromIndex('validationCaptures', 'by-date');
  return captures.reverse();
}

export async function deleteValidationCapture(id: string) {
  const db = await initDB();
  await db.delete('validationCaptures', id);
}

// Re-measures every stored capture with the current analyser so the whole series
// is comparable end to end. Only records that carry a raw signal and an outdated
// analyzerVersion are touched, and each keeps its original metrics in
// legacyMetrics, so this is idempotent and destroys nothing. Runs in one
// transaction: either the whole series is lifted or none of it is.
export async function reprocessStoredCaptures(): Promise<ReprocessSummary> {
  const db = await initDB();
  const stored = await db.getAll('validationCaptures');
  const pending = stored.filter(needsReprocessing);

  if (pending.length === 0) {
    return { total: stored.length, reprocessed: 0, skipped: stored.length };
  }

  const tx = db.transaction('validationCaptures', 'readwrite');
  await Promise.all(pending.map(capture => tx.store.put(reprocessCapture(capture))));
  await tx.done;

  return {
    total: stored.length,
    reprocessed: pending.length,
    skipped: stored.length - pending.length,
  };
}

export async function saveRecallTest(result: RecallTestResult) {
  const db = await initDB();
  await db.put('recallTests', result);
}

// Most-recent-first, matching the captures listing.
export async function getRecallTests(): Promise<RecallTestResult[]> {
  const db = await initDB();
  const tests = await db.getAllFromIndex('recallTests', 'by-date');
  return tests.reverse();
}
