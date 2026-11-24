/**
 * 혜택·이벤트 캡처 이미지 저장소.
 *
 * - 이미지는 IndexedDB에 data URL로 보관한다(새로고침·재방문 후에도 유지).
 * - 원본 그대로 두면 용량이 커지므로 긴 변 1280px·JPEG 0.82로 줄여 저장한다.
 * - 카드/이벤트 항목에는 capturePath(키)만 남고, 화면에서 키로 불러와 썸네일로 보여 준다.
 */
const DB_NAME = 'card-optimizer-captures';
const STORE = 'captures';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 캡처 저장소를 사용할 수 없습니다.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB를 열지 못했습니다.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('저장에 실패했습니다.'));
    tx.onabort = () => reject(tx.error ?? new Error('저장이 취소되었습니다.'));
  });
}

async function shrinkToDataUrl(file: File, maxSize = 1280, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다.');

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 열지 못했습니다.'));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function saveCapture(file: File): Promise<string> {
  const dataUrl = await shrinkToDataUrl(file);
  const key = `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(dataUrl, key);
  await txDone(tx);
  db.close();
  return key;
}

export async function getCapture(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function deleteCapture(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    await txDone(tx);
    db.close();
  } catch {
    // 저장소가 없거나 이미 지워진 경우는 무시한다.
  }
}

export function isCaptureSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}
