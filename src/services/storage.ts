import { openDB, DBSchema } from 'idb';
import { UserProfile, SessionResult, ValidationCapture } from '@/types';

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
}

const DB_NAME = 'linhafixa_db';
const DB_VERSION = 2;

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
