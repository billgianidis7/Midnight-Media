const DB_NAME = 'zeromedia-audio-store';
const STORE_NAME = 'audio-files';
const IMAGE_STORE_NAME = 'image-files';
const DB_VERSION = 2;

const resolvedImageUrlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalAudioBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalAudioBlob(id: string): Promise<Blob | null> {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalAudioBlob(id: string): Promise<void> {
  if (!id) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveLocalImageBlob(id: string, blob: Blob): Promise<string> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    tx.objectStore(IMAGE_STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const key = `idb://${id}`;
  const objectUrl = URL.createObjectURL(blob);
  resolvedImageUrlCache.set(key, objectUrl);
  return key;
}

export async function getLocalImageBlob(id: string): Promise<Blob | null> {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly');
    const req = tx.objectStore(IMAGE_STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalImageBlob(coverUrl: string): Promise<void> {
  if (!coverUrl || !coverUrl.startsWith('idb://')) return;
  const id = coverUrl.slice('idb://'.length);
  const cachedUrl = resolvedImageUrlCache.get(coverUrl);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    resolvedImageUrlCache.delete(coverUrl);
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    tx.objectStore(IMAGE_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllLocalMediaStores(): Promise<void> {
  resolvedImageUrlCache.forEach((url) => URL.revokeObjectURL(url));
  resolvedImageUrlCache.clear();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, IMAGE_STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(IMAGE_STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resolveCoverUrl(coverUrl: string): Promise<string> {
  if (!coverUrl) return '';
  if (!coverUrl.startsWith('idb://')) return coverUrl;

  const cached = resolvedImageUrlCache.get(coverUrl);
  if (cached) return cached;

  const id = coverUrl.slice('idb://'.length);
  const blob = await getLocalImageBlob(id);
  if (!blob) return '';

  const objectUrl = URL.createObjectURL(blob);
  resolvedImageUrlCache.set(coverUrl, objectUrl);
  return objectUrl;
}
