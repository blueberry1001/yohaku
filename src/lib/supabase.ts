import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Artwork,
  ArtworkDraft,
  ArtworkPatch,
  Comment,
  LibraryState,
} from "./types";
import {
  CONFLICT_MESSAGE,
  prepareImport,
  validateComment,
  validateDraft,
} from "./storage";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";
export const cloudConfigured = Boolean(projectUrl && publishableKey);
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  client ??= createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}

function requiredClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase)
    throw new Error(
      "共同編集には Supabase の接続設定が必要です。設定ガイドをご確認ください。",
    );
  return supabase;
}

type Row = Record<string, unknown>;
function artworkFromRow(row: Row): Artwork {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    creator: String(row.creator),
    kind: row.kind as Artwork["kind"],
    tags: row.tags as string[],
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
  };
}
function commentFromRow(row: Row): Comment {
  return {
    id: String(row.id),
    artworkId: String(row.artwork_id),
    body: String(row.body),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    createdAt: String(row.created_at),
  };
}
function draftToRow(draft: ArtworkDraft): Row {
  const { imageUrl, positionX, positionY, ...rest } = validateDraft(draft);
  return {
    ...rest,
    image_url: imageUrl || null,
    position_x: positionX,
    position_y: positionY,
  };
}

async function fetchRows(table: "artworks" | "comments"): Promise<Row[]> {
  const supabase = requiredClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (data.length < 1000) return rows;
  }
}

export async function loadCloudLibrary(): Promise<LibraryState> {
  const supabase = requiredClient();
  const { data: allowed, error } = await supabase.rpc("is_library_member");
  if (error) throw error;
  if (!allowed)
    throw new Error(
      "この Google アカウントはメンバーに登録されていません。管理者が許可した2人だけが利用できます。",
    );
  const [artworks, comments] = await Promise.all([
    fetchRows("artworks"),
    fetchRows("comments"),
  ]);
  return {
    artworks: artworks
      .map(artworkFromRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    comments: comments
      .map(commentFromRow)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function addCloudArtwork(draft: ArtworkDraft): Promise<Artwork> {
  const { data, error } = await requiredClient()
    .from("artworks")
    .insert(draftToRow(draft))
    .select()
    .single();
  if (error) throw error;
  return artworkFromRow(data as Row);
}

export async function updateCloudArtwork(
  current: Artwork,
  patch: ArtworkPatch,
  expectedRevision: number,
): Promise<Artwork> {
  const { data, error } = await requiredClient()
    .from("artworks")
    .update(draftToRow({ ...current, ...patch }))
    .eq("id", current.id)
    .eq("revision", expectedRevision)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(CONFLICT_MESSAGE);
  return artworkFromRow(data as Row);
}

export async function deleteCloudArtwork(
  id: string,
  expectedRevision: number,
): Promise<void> {
  const { data, error } = await requiredClient()
    .from("artworks")
    .delete()
    .eq("id", id)
    .eq("revision", expectedRevision)
    .select("id");
  if (error) throw error;
  if (!data.length) throw new Error(CONFLICT_MESSAGE);
}

export async function addCloudComment(
  artworkId: string,
  body: string,
): Promise<Comment> {
  const { data, error } = await requiredClient()
    .from("comments")
    .insert({ artwork_id: artworkId, body: validateComment(body) })
    .select()
    .single();
  if (error) throw error;
  return commentFromRow(data as Row);
}

export async function deleteCloudComment(id: string): Promise<void> {
  const { data, error } = await requiredClient()
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data.length) throw new Error("自分のコメントだけを削除できます。");
}

export async function importCloudLibrary(state: LibraryState): Promise<number> {
  const imported = prepareImport(state);
  const { error } = await requiredClient().rpc("import_library", {
    artwork_rows: imported.artworks.map((artwork) => ({
      ...draftToRow(artwork),
      id: artwork.id,
    })),
    comment_rows: imported.comments.map((comment) => ({
      id: comment.id,
      artwork_id: comment.artworkId,
      body: comment.body,
    })),
  });
  if (error) throw error;
  return imported.artworks.length;
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin)
    .href;
  const { error } = await requiredClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}
