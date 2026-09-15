// IndexedDB wrapper for history (replaces dexie lightweight)
// Stores finals + translations locally, no external dep.

type HistoryRecord = {
  id?: number;
  sessionId: string;
  seq: number;
  text: string;
  language: string;
  translations: Record<string, string>;
  ts: number;
};

const DB_NAME = "live-translate";
const STORE = "transcripts";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("indexedDB not available"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("ts", "ts", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTranscript(rec: Omit<HistoryRecord, "id">) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(rec);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* ignore if no indexedDB */ }
}

export async function getHistory(sessionId?: string): Promise<HistoryRecord[]> {
  try {
    const db = await openDB();
    return await new Promise<HistoryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = sessionId ? store.index("sessionId").getAll(sessionId) : store.getAll();
      req.onsuccess = () => resolve(req.result as HistoryRecord[]);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function clearHistory(sessionId?: string) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (sessionId) {
      const idx = store.index("sessionId");
      const req = idx.getAllKeys(sessionId);
      req.onsuccess = () => {
        for (const k of req.result) store.delete(k);
      };
    } else {
      store.clear();
    }
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* ignore */ }
}
