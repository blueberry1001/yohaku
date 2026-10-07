import type {
  Artwork,
  ArtworkDraft,
  ArtworkPatch,
  Comment,
  LibraryState,
} from "./types";
import {
  deleteDatabaseArtwork,
  deleteDatabaseComment,
  initializeDatabase,
  insertDatabaseComment,
  readDatabase,
  saveDatabaseArtwork,
  transactDatabase,
} from "./sqlite";

export const LOCAL_AUTHOR_ID = "local";
export const CONFLICT_MESSAGE =
  "別の画面で更新されています。最新の内容を確認して、もう一度保存してください。";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const artworkKinds = new Set(["illustration", "video", "photo", "design"]);
const reviewStatuses = new Set(["inbox", "reviewing", "reviewed"]);

function text(
  value: unknown,
  name: string,
  max: number,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error(
      `${name}を確認してください。${max}文字以内で入力できます。`,
    );
  return value.trim();
}

export function validateUrl(value: string, optional = false): string {
  if (optional && !value.trim()) return "";
  if (value.length > 4096) throw new Error("リンクが長すぎます。");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("https:// から始まるリンクを入力してください。");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error("http または https のリンクを入力してください。");
  return url.href;
}

export function validateDraft(value: unknown): ArtworkDraft {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("作品データの形式が正しくありません。");
  const v = value as Record<string, unknown>;
  if (!artworkKinds.has(String(v.kind)))
    throw new Error("作品の種類を選んでください。");
  if (!reviewStatuses.has(String(v.status)))
    throw new Error("整理状況を選んでください。");
  if (!Array.isArray(v.tags) || v.tags.length > 30)
    throw new Error("タグは30個まで保存できます。");
  const tags = [...new Set(v.tags.map((tag) => text(tag, "タグ", 60, true)))];
  if (typeof v.favorite !== "boolean")
    throw new Error("お気に入りの形式が正しくありません。");
  const positionX = Number(v.positionX ?? 0);
  const positionY = Number(v.positionY ?? 0);
  if (
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    Math.abs(positionX) > 100000 ||
    Math.abs(positionY) > 100000
  )
    throw new Error("ボード上の位置が正しくありません。");
  return {
    title: text(v.title, "タイトル", 200, true),
    url: validateUrl(text(v.url, "リンク", 4096, true)),
    creator: text(v.creator, "作者", 200),
    kind: v.kind as ArtworkDraft["kind"],
    tags,
    description: text(v.description, "説明", 5000),
    notes: text(v.notes, "メモ", 20000),
    collection: text(v.collection, "コレクション", 100),
    favorite: v.favorite,
    status: v.status as ArtworkDraft["status"],
    imageUrl:
      validateUrl(text(v.imageUrl ?? "", "画像リンク", 4096), true) ||
      undefined,
    positionX,
    positionY,
  };
}

export function validateComment(body: string): string {
  return text(body, "コメント", 5000, true);
}

function identifier(value: unknown): string {
  const result = text(value, "ID", 100, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new Error("IDの形式が正しくありません。");
  return result;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error("日時の形式が正しくありません。");
  return new Date(value).toISOString();
}

function parseArtwork(value: unknown): Artwork {
  const draft = validateDraft(value);
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1)
    throw new Error("更新番号の形式が正しくありません。");
  return {
    ...draft,
    id: identifier(v.id),
    createdBy: text(v.createdBy, "作成者ID", 100, true),
    createdAt: timestamp(v.createdAt),
    updatedAt: timestamp(v.updatedAt),
    revision: Number(v.revision),
  };
}

function parseComment(value: unknown): Comment {
  if (!value || typeof value !== "object")
    throw new Error("コメントの形式が正しくありません。");
  const v = value as Record<string, unknown>;
  return {
    id: identifier(v.id),
    artworkId: identifier(v.artworkId),
    body: validateComment(v.body as string),
    authorId: text(v.authorId, "投稿者ID", 100, true),
    authorName: text(v.authorName, "投稿者名", 200, true),
    createdAt: timestamp(v.createdAt),
  };
}

export function parseLibraryExport(json: string): LibraryState {
  if (new TextEncoder().encode(json).length > MAX_IMPORT_BYTES)
    throw new Error("インポートできるファイルは5 MBまでです。");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("JSONファイルを読み取れませんでした。");
  }
  if (!value || typeof value !== "object")
    throw new Error("ライブラリの形式が正しくありません。");
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    !Array.isArray(v.artworks) ||
    !Array.isArray(v.comments) ||
    v.artworks.length > 5000 ||
    v.comments.length > 20000
  )
    throw new Error("対応していないライブラリ形式、または件数が多すぎます。");
  const artworks = v.artworks.map(parseArtwork);
  const comments = v.comments.map(parseComment);
  const ids = new Set(artworks.map((artwork) => artwork.id));
  if (
    ids.size !== artworks.length ||
    new Set(comments.map((comment) => comment.id)).size !== comments.length
  )
    throw new Error("IDが重複しています。");
  if (comments.some((comment) => !ids.has(comment.artworkId)))
    throw new Error("作品と関連付けられていないコメントがあります。");
  return { artworks, comments };
}

export function serializeLibrary(state: LibraryState): string {
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), ...state },
    null,
    2,
  );
}

export function readLocalLibrary(): LibraryState {
  return readDatabase();
}

export async function seedLocalLibrary(
  artworks: Artwork[],
  comments: Comment[] = [],
): Promise<void> {
  await initializeDatabase({
    artworks: artworks.map(parseArtwork),
    comments: comments.map(parseComment),
  });
}

export async function withLocalLock<T>(callback: () => T): Promise<T> {
  return transactDatabase(callback);
}

export function createArtwork(
  draft: ArtworkDraft,
  authorId = LOCAL_AUTHOR_ID,
): Artwork {
  const now = new Date().toISOString();
  return {
    ...validateDraft(draft),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdBy: authorId,
    revision: 1,
  };
}

export function saveLocalArtwork(artwork: Artwork): void {
  saveDatabaseArtwork(artwork);
}

export function updateLocalArtwork(
  id: string,
  patch: ArtworkPatch,
  expectedRevision: number,
): Artwork {
  const current = readLocalLibrary().artworks.find(
    (artwork) => artwork.id === id,
  );
  if (!current || current.revision !== expectedRevision)
    throw new Error(CONFLICT_MESSAGE);
  const next = {
    ...current,
    ...validateDraft({ ...current, ...patch }),
    updatedAt: new Date().toISOString(),
    revision: current.revision + 1,
  };
  saveLocalArtwork(next);
  return next;
}

export function deleteLocalArtwork(id: string, expectedRevision: number): void {
  const state = readLocalLibrary();
  const current = state.artworks.find((artwork) => artwork.id === id);
  if (!current || current.revision !== expectedRevision)
    throw new Error(CONFLICT_MESSAGE);
  deleteDatabaseArtwork(id);
}

export function addLocalComment(artworkId: string, body: string): Comment {
  if (!readLocalLibrary().artworks.some((artwork) => artwork.id === artworkId))
    throw new Error("作品が見つかりません。");
  const comment = {
    id: crypto.randomUUID(),
    artworkId,
    body: validateComment(body),
    authorId: LOCAL_AUTHOR_ID,
    authorName: "あなた",
    createdAt: new Date().toISOString(),
  };
  insertDatabaseComment(comment);
  return comment;
}

/** Imports append copies. Existing entries are never silently replaced. */
export function prepareImport(
  state: LibraryState,
  authorId = LOCAL_AUTHOR_ID,
): LibraryState {
  const ids = new Map<string, string>();
  const now = new Date().toISOString();
  const artworks = state.artworks.map((artwork) => {
    const id = crypto.randomUUID();
    ids.set(artwork.id, id);
    return { ...artwork, id, revision: 1, createdBy: authorId, updatedAt: now };
  });
  const comments = state.comments.map((comment) => ({
    ...comment,
    id: crypto.randomUUID(),
    artworkId: ids.get(comment.artworkId)!,
    authorId,
  }));
  return { artworks, comments };
}

export function importLocalLibrary(state: LibraryState): number {
  const imported = prepareImport(state);
  for (const artwork of imported.artworks) saveDatabaseArtwork(artwork);
  for (const comment of imported.comments) insertDatabaseComment(comment);
  return imported.artworks.length;
}

export function deleteLocalComment(id: string): void {
  const comment = readLocalLibrary().comments.find((item) => item.id === id);
  if (!comment || comment.authorId !== LOCAL_AUTHOR_ID)
    throw new Error("自分のコメントだけを削除できます。");
  deleteDatabaseComment(id);
}
