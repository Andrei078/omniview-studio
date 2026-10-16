// Browser APIs that jsdom lacks, so the real modules can run in tests.
import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
globalThis.__OV_TEST__ = true;
globalThis.Blob = NodeBlob; globalThis.File = NodeFile; window.Blob = NodeBlob; window.File = NodeFile;
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
URL.createObjectURL = () => "blob:test"; URL.revokeObjectURL = () => {};
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
class NoopObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver = NoopObserver; globalThis.ResizeObserver = NoopObserver;
window.scrollTo = () => {};

// Node's Blob.arrayBuffer() returns a buffer from another JS realm than jsdom's globals; libraries doing
// `instanceof ArrayBuffer` (JSZip in mammoth) would reject it. Real browsers have a single realm.
const origAB = NodeBlob.prototype.arrayBuffer;
NodeBlob.prototype.arrayBuffer = async function () { const src = new Uint8Array(await origAB.call(this)); const out = new window.ArrayBuffer(src.byteLength); new window.Uint8Array(out).set(src); return out; };
