import { beforeAll, describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js";
import type { Artwork } from "./types";
import {
  addLocalComment,
  deleteLocalArtwork,
  parseLibraryExport,
  readLocalLibrary,
  seedLocalLibrary,
  serializeLibrary,
  updateLocalArtwork,
  withLocalLock,
} from "./storage";
import {
  databaseStorageInfo,
  openDatabaseFile,
  saveDatabaseFileAs,
} from "./sqlite";

vi.mock("sql.js/dist/sql-wasm.wasm?url", () => ({
  default: "node_modules/sql.js/dist/sql-wasm.wasm",
}));
const sample: Artwork = {
  id: "sqlite-1",
  title: "データベース検証",
  url: "https://example.com",
  creator: "",
  kind: "design",
  tags: [],
  description: "",
  notes: "",
  collection: "",
  favorite: false,
  status: "inbox",
  positionX: 0,
  positionY: 0,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  createdBy: "local",
  revision: 1,
};
let savedBytes: Uint8Array = new Uint8Array();
const handle = {
  name: "test.db",
  getFile: async () => ({
    size: savedBytes.length,
    arrayBuffer: async () => savedBytes.slice().buffer,
  }),
  createWritable: async () => {
    let pending = savedBytes;
    return {
      write: async (value: Uint8Array) => {
        pending = value.slice();
      },
      close: async () => {
        savedBytes = pending;
      },
      abort: async () => undefined,
    };
  },
};
beforeAll(async () => {
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", {
    showSaveFilePicker: async () => handle,
    showOpenFilePicker: async () => [handle],
  });
  await seedLocalLibrary([sample]);
});

describe("real SQLite file persistence", () => {
  it("starts in ephemeral demo memory and rejects stale revisions", async () => {
    expect(databaseStorageInfo().mode).toBe("demo");
    await withLocalLock(() =>
      updateLocalArtwork(sample.id, { notes: "保存前のメモ" }, 1),
    );
    await expect(
      withLocalLock(() =>
        updateLocalArtwork(sample.id, { notes: "古い変更" }, 1),
      ),
    ).rejects.toThrow("更新");
    expect(readLocalLibrary().artworks[0].notes).toBe("保存前のメモ");
  });
  it("writes a real SQLite file and reopens records including comments", async () => {
    await saveDatabaseFileAs();
    expect(new TextDecoder().decode(savedBytes.slice(0, 15))).toBe(
      "SQLite format 3",
    );
    await withLocalLock(() => addLocalComment(sample.id, "独立したコメント"));
    await openDatabaseFile((state) => {
      parseLibraryExport(serializeLibrary(state));
    });
    expect(readLocalLibrary().comments[0].body).toBe("独立したコメント");
    expect(databaseStorageInfo().mode).toBe("file");
  });
  it("rolls back a write if another application changed the file", async () => {
    const before = savedBytes.slice();
    savedBytes = new Uint8Array([1, 2, 3]);
    await expect(
      withLocalLock(() =>
        updateLocalArtwork(sample.id, { notes: "上書きしない" }, 2),
      ),
    ).rejects.toThrow("別の画面");
    expect(readLocalLibrary().artworks[0].notes).toBe("保存前のメモ");
    expect(savedBytes).toEqual(new Uint8Array([1, 2, 3]));
    savedBytes = before;
  });
  it("cascades artwork deletion to comments", async () => {
    await withLocalLock(() => deleteLocalArtwork(sample.id, 2));
    expect(readLocalLibrary()).toEqual({ artworks: [], comments: [] });
  });
  it("rejects unrelated SQLite files without replacing the active database", async () => {
    const before = savedBytes.slice();
    const SQL = await initSqlJs({
      locateFile: () => "node_modules/sql.js/dist/sql-wasm.wasm",
    });
    const foreign = new SQL.Database();
    foreign.run("CREATE TABLE private_data (value TEXT)");
    savedBytes = foreign.export();
    foreign.close();
    await expect(
      openDatabaseFile((state) => {
        parseLibraryExport(serializeLibrary(state));
      }),
    ).rejects.toThrow("対応するDB");
    expect(readLocalLibrary()).toEqual({ artworks: [], comments: [] });
    savedBytes = before;
  });
});
