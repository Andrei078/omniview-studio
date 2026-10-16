import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as db from "../js/db.js";
import * as L from "../js/library.js";

const png = (n = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, n)]);
const F = (data, name) => new File([data], name);
beforeEach(async () => { await db.init(new IDBFactory()); L.state.items = []; L.state.cols = []; L.state.sel.clear(); Object.assign(L.state, { section: "all", q: "", sort: "new", type: "all", colId: null }); await L.load(); });

describe("import", () => {
  it("imports, detects, skips duplicates and reports unrecognized files", async () => {
    const rep = await L.importFiles([F(png(1), "a.png"), F("hello", "n.txt"), F("a,b\n1,2", "t.csv"), F(png(1), "copy.png"), F(Buffer.from([0, 1, 2, 0, 3]), "junk.bin")]);
    expect(rep.ok).toHaveLength(3); expect(rep.dup).toBe(1); expect(rep.bad.map((b) => b.name)).toEqual(["junk.bin"]);
    expect(L.state.items.map((i) => i.fmt).sort()).toEqual(["csv", "png", "txt"]);
    expect(L.state.items.find((i) => i.name === "a.png").cat).toBe("img");
  });
  it("persists across a reload", async () => {
    await L.importFiles([F("hello", "n.txt")]); const stored = L.state.items[0];
    L.state.items = []; await L.load();
    expect(L.state.items).toHaveLength(1); expect(await L.state.items[0].blob.text()).toBe("hello"); expect(L.state.items[0].id).toBe(stored.id);
  });
  it("reports progress and can be cancelled", async () => {
    const files = Array.from({ length: 10 }, (_, i) => F(png(i + 10), `f${i}.png`)), ac = new AbortController(), seen = [];
    const rep = await L.importFiles(files, { signal: ac.signal, onProgress: (i, n) => { seen.push([i, n]); if (i === 3) ac.abort(); } });
    expect(rep.cancelled).toBe(true); expect(rep.ok.length).toBeLessThan(10); expect(seen[0]).toEqual([0, 10]);
  });
  it("re-importing a trashed file restores it instead of duplicating", async () => {
    await L.importFiles([F(png(5), "a.png")]); await L.trash([L.state.items[0].id]);
    const rep = await L.importFiles([F(png(5), "again.png")]);
    expect(rep.restored).toBe(1); expect(L.state.items).toHaveLength(1); expect(L.state.items[0].trashed).toBe(0);
  });
  it("many files at once", async () => {
    const files = Array.from({ length: 300 }, (_, i) => F(Buffer.concat([png(i % 250), Buffer.from(String(i))]), `p${i}.png`));
    const rep = await L.importFiles(files); expect(rep.ok.length).toBe(300); expect(L.counts().img).toBe(300);
    expect(L.visible()).toHaveLength(300);
  });
});

describe("organize", () => {
  beforeEach(async () => { await L.importFiles([F(png(1), "b.png"), F("x", "a.txt"), F("# t", "c.md")]); });
  const id = (n) => L.state.items.find((i) => i.name === n).id;
  it("favorites, tags and search", async () => {
    await L.setFav([id("a.txt")], true); await L.addTag([id("b.png")], " holiday "); await L.addTag([id("b.png")], "holiday");
    expect(L.byId(id("b.png")).tags).toEqual(["holiday"]);
    L.state.section = "fav"; expect(L.visible().map((i) => i.name)).toEqual(["a.txt"]);
    L.state.section = "all"; L.state.q = "holi"; expect(L.visible().map((i) => i.name)).toEqual(["b.png"]);
    L.state.q = "MD"; expect(L.visible().map((i) => i.name)).toEqual(["c.md"]);
    await L.removeTag([id("b.png")], "holiday"); expect(L.byId(id("b.png")).tags).toEqual([]);
  });
  it("sections, type filter and sorting", () => {
    L.state.section = "img"; expect(L.visible()).toHaveLength(1);
    L.state.section = "doc"; expect(L.visible().map((i) => i.name).sort()).toEqual(["a.txt", "c.md"]);
    L.state.type = "md"; expect(L.visible().map((i) => i.name)).toEqual(["c.md"]);
    L.state.section = "all"; L.state.type = "all"; L.state.sort = "name"; expect(L.visible().map((i) => i.name)).toEqual(["a.txt", "b.png", "c.md"]);
    L.state.sort = "type"; expect(L.visible()[0].fmt).toBe("md".localeCompare("png") < 0 ? "md" : "png");
  });
  it("trash, restore and permanent delete (including the database)", async () => {
    await L.trash([id("a.txt")]); expect(L.visible().map((i) => i.name)).not.toContain("a.txt");
    L.state.section = "trash"; expect(L.visible().map((i) => i.name)).toEqual(["a.txt"]); expect(L.counts().trash).toBe(1);
    await L.restore([id("a.txt")]); expect(L.counts().trash).toBe(0);
    await L.trash([id("a.txt")]); await L.emptyTrash(); L.state.items = []; await L.load();
    expect(L.state.items.map((i) => i.name).sort()).toEqual(["b.png", "c.md"]);
  });
  it("collections: create, add, rename, remove, delete", async () => {
    const c = await L.createCol("Trip"); expect((await L.createCol("trip")).id).toBe(c.id); expect(await L.createCol("  ")).toBeNull();
    await L.addToCol([id("b.png"), id("a.txt")], c.id); L.state.section = "col"; L.state.colId = c.id; expect(L.visible()).toHaveLength(2);
    await L.renameCol(c.id, "Journey"); expect(L.state.cols[0].name).toBe("Journey");
    await L.removeFromCol([id("a.txt")], c.id); expect(L.visible()).toHaveLength(1);
    await L.deleteCol(c.id); expect(L.state.cols).toHaveLength(0); expect(L.byId(id("b.png")).cols).toEqual([]);
  });
  it("recent list orders by last opened; edits and views persist", async () => {
    await L.markOpened(id("a.txt")); await new Promise((r) => setTimeout(r, 5)); await L.markOpened(id("c.md"));
    L.state.section = "recent"; expect(L.visible().map((i) => i.name)).toEqual(["c.md", "a.txt"]);
    const r = L.byId(id("a.txt")); r.view = { page: 7 }; await L.save(r); L.state.items = []; await L.load(); expect(L.byId(id("a.txt")).view.page).toBe(7);
  });
  it("addBlob stores generated files as new items", async () => {
    const rec = await L.addBlob("edited.png", new Blob([png(9)], { type: "image/png" })); expect(rec.fmt).toBe("png"); expect(L.state.items).toHaveLength(4);
  });
  it("wipe removes everything", async () => { await L.createCol("x"); await L.wipe(); L.state.items = []; await L.load(); expect(L.state.items).toEqual([]); expect(L.state.cols).toEqual([]); });
});
