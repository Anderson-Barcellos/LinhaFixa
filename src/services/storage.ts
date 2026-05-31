import { openDB, DBSchema } from 'idb';
import { UserProfile, SessionResult } from '@/types';

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
}

const DB_NAME = 'linhafixa_db';
const DB_VERSION = 1;

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
