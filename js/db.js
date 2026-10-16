// IndexedDB layer: two stores, files (with blobs) and collections.
let dbp = null;
export function init(factory = globalThis.indexedDB) {
  dbp = new Promise((ok, no) => {
    const r = factory.open("omniview", 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("f")) d.createObjectStore("f", { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains("c")) d.createObjectStore("c", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp;
}
async function run(store, mode, fn) {
  const d = await dbp;
  return new Promise((ok, no) => {
    const x = d.transaction(store, mode), q = fn(x.objectStore(store));
    x.oncomplete = () => ok(q && q.result);
    x.onerror = x.onabort = () => no(x.error);
  });
}
export const files = { all: () => run("f", "readonly", (s) => s.getAll()), put: (r) => run("f", "readwrite", (s) => s.put(r)), del: (id) => run("f", "readwrite", (s) => s.delete(id)), clear: () => run("f", "readwrite", (s) => s.clear()) };
export const cols = { all: () => run("c", "readonly", (s) => s.getAll()), put: (r) => run("c", "readwrite", (s) => s.put(r)), del: (id) => run("c", "readwrite", (s) => s.delete(id)), clear: () => run("c", "readwrite", (s) => s.clear()) };
