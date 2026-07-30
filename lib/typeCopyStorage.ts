import { type TypeCopyResult, typeCopyStorageKey } from './typeCopyDemo';

const dbName = 'nyaysetu_type_copy';
const storeName = 'results';
const latestKey = 'latest';
const indexedDbMarker = '__indexeddb__';

function hasIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openTypeCopyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeStore<T>(db: IDBDatabase, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = action(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function readStore<T>(db: IDBDatabase, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = action(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveTypeCopyResult(result: TypeCopyResult) {
  if (hasIndexedDb()) {
    try {
      const db = await openTypeCopyDb();
      try {
        await writeStore(db, (store) => store.put(result, latestKey));
        try {
          window.localStorage.setItem(typeCopyStorageKey, indexedDbMarker);
        } catch {
          // IndexedDB already has the result; the marker is only a fallback hint.
        }
        return;
      } finally {
        db.close();
      }
    } catch {
      // Fall back to localStorage below.
    }
  }

  window.localStorage.setItem(typeCopyStorageKey, JSON.stringify(result));
}

export async function loadTypeCopyResult(): Promise<TypeCopyResult | null> {
  if (hasIndexedDb()) {
    try {
      const db = await openTypeCopyDb();
      try {
        const result = await readStore<TypeCopyResult | undefined>(db, (store) => store.get(latestKey));
        if (result) return result;
      } finally {
        db.close();
      }
    } catch {
      // Fall back to localStorage below.
    }
  }

  const stored = window.localStorage.getItem(typeCopyStorageKey);
  if (!stored || stored === indexedDbMarker) return null;

  return JSON.parse(stored) as TypeCopyResult;
}

export async function clearTypeCopyResult() {
  if (hasIndexedDb()) {
    const db = await openTypeCopyDb();
    try {
      await writeStore(db, (store) => store.delete(latestKey));
    } finally {
      db.close();
    }
  }

  window.localStorage.removeItem(typeCopyStorageKey);
}
