import initSqlJs, {
  type Database,
  type SqlJsStatic,
  type SqlValue,
} from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import schema from "../../docs/schema.sqlite.sql?raw";
import type { Artwork, Comment, LibraryState } from "./types";

type WritableFile = {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type DatabaseHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(options?: { mode?: string }): Promise<WritableFile>;
};
type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<DatabaseHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<DatabaseHandle>;
};
let sqlitePromise: Promise<SqlJsStatic> | null = null;
let sqlite: SqlJsStatic | null = null;
let database: Database | null = null;
let fileHandle: DatabaseHandle | null = null;
let savedSignature = "";
let queue: Promise<unknown> = Promise.resolve();
const pickerTypes = [
  {
    description: "Yohaku SQLite データベース",
    accept: { "application/x-sqlite3": [".db", ".sqlite"] },
  },
];
const APP_ID = 1498372161;

async function engine(): Promise<SqlJsStatic> {
  sqlitePromise ??= initSqlJs({ locateFile: () => wasmUrl });
  sqlite = await sqlitePromise;
  return sqlite;
}
function current(): Database {
  if (!database) throw new Error("データベースの準備中です。");
  return database;
}
function query(db: Database, sql: string): Record<string, SqlValue>[] {
  const statement = db.prepare(sql);
  const results: Record<string, SqlValue>[] = [];
  try {
    while (statement.step()) results.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return results;
}
function read(db: Database): LibraryState {
  return {
    artworks: query(db, "SELECT * FROM artworks ORDER BY created_at DESC").map(
      (row) => ({
        id: String(row.id),
        title: String(row.title),
        url: String(row.url),
        creator: String(row.creator),
        kind: row.kind as Artwork["kind"],
        tags: JSON.parse(String(row.tags)),
        description: String(row.description),
        notes: String(row.notes),
        collection: String(row.collection),
        favorite: Boolean(row.favorite),
        status: row.status as Artwork["status"],
        imageUrl: row.image_url ? String(row.image_url) : undefined,
        positionX: Number(row.position_x),
        positionY: Number(row.position_y),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        createdBy: String(row.created_by),
        revision: Number(row.revision),
      }),
    ),
    comments: query(db, "SELECT * FROM comments ORDER BY created_at").map(
      (row) => ({
        id: String(row.id),
        artworkId: String(row.artwork_id),
        body: String(row.body),
        authorId: String(row.author_id),
        authorName: String(row.author_name),
        createdAt: String(row.created_at),
      }),
    ),
  };
}
function insertArtwork(db: Database, artwork: Artwork): void {
  db.run(
    `INSERT INTO artworks (id,title,url,creator,kind,tags,description,notes,collection,favorite,status,image_url,position_x,position_y,created_at,updated_at,created_by,revision)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,creator=excluded.creator,kind=excluded.kind,tags=excluded.tags,description=excluded.description,notes=excluded.notes,collection=excluded.collection,favorite=excluded.favorite,status=excluded.status,image_url=excluded.image_url,position_x=excluded.position_x,position_y=excluded.position_y,updated_at=excluded.updated_at,revision=excluded.revision`,
    [
      artwork.id,
      artwork.title,
      artwork.url,
      artwork.creator,
      artwork.kind,
      JSON.stringify(artwork.tags),
      artwork.description,
      artwork.notes,
      artwork.collection,
      artwork.favorite ? 1 : 0,
      artwork.status,
      artwork.imageUrl ?? null,
      artwork.positionX,
      artwork.positionY,
      artwork.createdAt,
      artwork.updatedAt,
      artwork.createdBy,
      artwork.revision,
    ],
  );
}
function insertComment(db: Database, comment: Comment): void {
  db.run(
    "INSERT INTO comments (id,artwork_id,body,author_id,author_name,created_at) VALUES (?,?,?,?,?,?)",
    [
      comment.id,
      comment.artworkId,
      comment.body,
      comment.authorId,
      comment.authorName,
      comment.createdAt,
    ],
  );
}

export async function initializeDatabase(seed: LibraryState): Promise<void> {
  if (database) return;
  const SQL = await engine();
  if (database) return;
  database = new SQL.Database();
  database.run(schema);
  database.run("BEGIN");
  try {
    for (const artwork of seed.artworks) insertArtwork(database, artwork);
    for (const comment of seed.comments) insertComment(database, comment);
    database.run("COMMIT");
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

export function readDatabase(): LibraryState {
  return read(current());
}
export function saveDatabaseArtwork(artwork: Artwork): void {
  insertArtwork(current(), artwork);
}
export function deleteDatabaseArtwork(id: string): void {
  current().run("DELETE FROM artworks WHERE id=?", [id]);
}
export function insertDatabaseComment(comment: Comment): void {
  insertComment(current(), comment);
}
export function deleteDatabaseComment(id: string): void {
  current().run("DELETE FROM comments WHERE id=?", [id]);
}
export function databaseStorageInfo() {
  return {
    mode: fileHandle ? ("file" as const) : ("demo" as const),
    storageLabel: fileHandle?.name ?? "デモ · この画面を閉じると消えます",
    fileSupported: Boolean(
      (window as PickerWindow).showOpenFilePicker &&
      (window as PickerWindow).showSaveFilePicker,
    ),
  };
}

async function signature(data: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function persist(): Promise<void> {
  if (!fileHandle) return;
  // Exclusive writer + content comparison detects changes made by another tab/app.
  const writable = await fileHandle.createWritable({ mode: "exclusive" });
  try {
    const previous = new Uint8Array(
      await (await fileHandle.getFile()).arrayBuffer(),
    );
    if ((await signature(previous)) !== savedSignature)
      throw new Error(
        "DBファイルが別の画面またはアプリで変更されました。上書きせずに保存を止めました。ファイルを開き直してください。",
      );
    const bytes = current().export();
    await writable.write(bytes);
    await writable.close();
    savedSignature = await signature(bytes);
    current().run("PRAGMA foreign_keys=ON");
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(() =>
    navigator.locks
      ? navigator.locks.request("yohaku-database-file", work)
      : work(),
  );
  queue = result.catch(() => undefined);
  return result;
}

export function transactDatabase<T>(operation: () => T): Promise<T> {
  const work = async () => {
    const db = current();
    const backup = db.export();
    db.run("PRAGMA foreign_keys=ON; BEGIN");
    try {
      const result = operation();
      db.run("COMMIT");
      await persist();
      return result;
    } catch (error) {
      // Restore in-memory data as well when a durable file write fails.
      db.close();
      database = new sqlite!.Database(backup);
      database.run("PRAGMA foreign_keys=ON");
      throw error;
    }
  };
  return enqueue(work);
}

function pickerError(): Error {
  return new Error(
    "このブラウザはDBファイルへの直接保存に対応していません。PC版の Chrome / Edge、または Windows 版をご利用ください。",
  );
}

export async function openDatabaseFile(
  validate: (state: LibraryState) => void,
): Promise<void> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) throw pickerError();
  const [handle] = await picker({ types: pickerTypes, multiple: false });
  return enqueue(async () => {
    const file = await handle.getFile();
    if (file.size > 25 * 1024 * 1024)
      throw new Error(
        "Web版では25 MBまでのDBファイルを開けます。大きなDBは Windows 版をご利用ください。",
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const SQL = await engine();
    const candidate = new SQL.Database(bytes);
    try {
      if (
        candidate.exec("PRAGMA application_id")[0]?.values[0]?.[0] !== APP_ID ||
        candidate.exec("PRAGMA user_version")[0]?.values[0]?.[0] !== 1
      )
        throw new Error("Yohaku の対応するDBファイルではありません。");
      if (candidate.exec("PRAGMA integrity_check")[0]?.values[0]?.[0] !== "ok")
        throw new Error("DBファイルが破損している可能性があります。");
      if (candidate.exec("PRAGMA foreign_key_check").length)
        throw new Error("作品とコメントの関連付けが壊れています。");
      validate(read(candidate));
      candidate.run("PRAGMA foreign_keys=ON");
    } catch (error) {
      candidate.close();
      throw error;
    }
    const digest = await signature(bytes);
    database?.close();
    database = candidate;
    fileHandle = handle;
    savedSignature = digest;
  });
}

export async function saveDatabaseFileAs(): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) throw pickerError();
  const handle = await picker({
    types: pickerTypes,
    suggestedName: "yohaku.db",
  });
  return enqueue(async () => {
    const bytes = current().export();
    current().run("PRAGMA foreign_keys=ON");
    const writable = await handle.createWritable({ mode: "exclusive" });
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    fileHandle = handle;
    savedSignature = await signature(bytes);
  });
}

/** Create an empty library; save-as is the action that copies the current library. */
export async function createDatabaseFile(): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) throw pickerError();
  const handle = await picker({
    types: pickerTypes,
    suggestedName: "yohaku.db",
  });
  return enqueue(async () => {
    const SQL = await engine();
    const candidate = new SQL.Database();
    candidate.run(schema);
    const bytes = candidate.export();
    let writable: WritableFile | undefined;
    try {
      writable = await handle.createWritable({ mode: "exclusive" });
      await writable.write(bytes);
      await writable.close();
      candidate.run("PRAGMA foreign_keys=ON");
    } catch (error) {
      await writable?.abort().catch(() => undefined);
      candidate.close();
      throw error;
    }
    database?.close();
    database = candidate;
    fileHandle = handle;
    savedSignature = await signature(bytes);
  });
}
