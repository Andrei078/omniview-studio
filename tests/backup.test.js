import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as fflate from "fflate";
import * as db from "../js/db.js";
import * as L from "../js/library.js";
import { exportBackup, importBackup } from "../js/backup.js";

globalThis.fflate = fflate;
const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, n)]);
beforeEach(async () => { await db.init(new IDBFactory()); L.state.items = []; L.state.cols = []; await L.load(); });

describe("backup", () => {
  it("round-trips files, tags, favorites, collections and views", async () => {
    await L.importFiles([new File([png(1)], "a.png"), new File(["hello"], "n.txt")]);
    const a = L.state.items.find((i) => i.name === "a.png"), c = await L.createCol("Trip");
    await L.addTag([a.id], "x"); await L.setFav([a.id], true); await L.addToCol([a.id], c.id); a.view = { page: 3 }; await L.save(a);
    const zip = await exportBackup();
    await L.wipe(); expect(L.state.items).toHaveLength(0);
    const rep = await importBackup(new File([Buffer.from(await zip.arrayBuffer())], "b.zip"));
    expect(rep).toEqual({ added: 2, skipped: 0 });
    const back = L.state.items.find((i) => i.name === "a.png");
    expect(back.tags).toEqual(["x"]); expect(back.fav).toBe(1); expect(back.view.page).toBe(3); expect(L.state.cols.find((x) => x.id === back.cols[0]).name).toBe("Trip");
    expect(await L.state.items.find((i) => i.name === "n.txt").blob.text()).toBe("hello");
    expect(Buffer.from(await back.blob.arrayBuffer()).equals(png(1))).toBe(true);
  });
  it("skips files already in the library", async () => {
    await L.importFiles([new File(["hello"], "n.txt")]); const zip = await exportBackup();
    expect(await importBackup(new File([Buffer.from(await zip.arrayBuffer())], "b.zip"))).toEqual({ added: 0, skipped: 1 });
  });
  it("rejects invalid and newer backups with clear errors", async () => {
    await expect(importBackup(new File(["not a zip"], "x.zip"))).rejects.toThrow("not a valid backup");
    const bad = fflate.zipSync({ "manifest.json": fflate.strToU8(JSON.stringify({ app: "other" })) });
    await expect(importBackup(new File([Buffer.from(bad)], "x.zip"))).rejects.toThrow("not a valid backup");
    const newer = fflate.zipSync({ "manifest.json": fflate.strToU8(JSON.stringify({ app: "omniview", version: 9, items: [] })) });
    await expect(importBackup(new File([Buffer.from(newer)], "x.zip"))).rejects.toThrow("newer version");
  });
});
