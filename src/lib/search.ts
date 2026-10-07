import type { Artwork, Comment, SearchFilters, SearchResult } from "./types";

/** Width, case and kana differences should not hide a remembered reference. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[ァ-ヶ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .replace(/\s+/g, " ")
    .trim();
}

const synonymGroups = [
  ["青", "青い", "ブルー", "blue", "寒色"],
  ["赤", "赤い", "レッド", "red"],
  ["緑", "グリーン", "green"],
  ["黄", "黄色", "イエロー", "yellow"],
  ["桃色", "ピンク", "pink"],
  ["紫", "パープル", "purple"],
  ["白黒", "モノクロ", "monochrome", "モノトーン"],
  ["暖色", "暖かい", "あたたかい", "warm"],
  ["静か", "静けさ", "静かな", "静寂", "quiet", "穏やか"],
  ["懐かしい", "ノスタルジック", "ノスタルジー", "nostalgic"],
  ["余白", "negative space", "ミニマル", "minimal"],
  ["対称", "シンメトリー", "symmetry"],
  ["逆光", "backlight", "バックライト"],
  ["俯瞰", "俯瞰構図", "鳥瞰", "birdseye"],
  ["動画", "映像", "ムービー", "video"],
  ["絵", "イラスト", "イラストレーション", "illustration"],
  ["写真", "photo", "photography"],
  ["デザイン", "design"],
].map((group) => group.map(normalizeSearch));

function alternatives(token: string): string[] {
  const group = synonymGroups.find((words) => words.includes(token));
  return group ? [...new Set([token, ...group])] : [token];
}

export function searchArtworks(
  artworks: Artwork[],
  comments: Comment[],
  query: string,
  filters: SearchFilters = {},
): SearchResult[] {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const commentsByArtwork = new Map<string, string[]>();
  for (const comment of comments) {
    const existing = commentsByArtwork.get(comment.artworkId) ?? [];
    existing.push(comment.body);
    commentsByArtwork.set(comment.artworkId, existing);
  }
  const results: SearchResult[] = [];
  for (const artwork of artworks) {
    if (filters.kind && filters.kind !== "all" && artwork.kind !== filters.kind)
      continue;
    if (filters.collection && artwork.collection !== filters.collection)
      continue;
    if (filters.favorite && !artwork.favorite) continue;
    if (filters.status && artwork.status !== filters.status) continue;
    if (
      filters.tags?.some(
        (tag) =>
          !artwork.tags.some(
            (t) => normalizeSearch(t) === normalizeSearch(tag),
          ),
      )
    )
      continue;
    const fields = [
      { name: "タイトル", text: artwork.title, weight: 8 },
      { name: "タグ", text: artwork.tags.join(" "), weight: 7 },
      { name: "作者", text: artwork.creator, weight: 6 },
      { name: "コレクション", text: artwork.collection, weight: 4 },
      { name: "メモ", text: artwork.notes, weight: 3 },
      { name: "説明", text: artwork.description, weight: 3 },
      {
        name: "コメント",
        text: (commentsByArtwork.get(artwork.id) ?? []).join(" "),
        weight: 2,
      },
      { name: "種類", text: artwork.kind, weight: 2 },
      { name: "リンク", text: artwork.url, weight: 1 },
    ].map((field) => ({ ...field, text: normalizeSearch(field.text) }));
    const matchedFields = new Set<string>();
    let score = 0;
    const matchesAll = tokens.every((token) => {
      const terms = alternatives(token);
      let best = 0;
      for (const field of fields) {
        if (terms.some((term) => field.text.includes(term))) {
          const exact = field.text.includes(token);
          best = Math.max(best, field.weight + (exact ? 2 : 0));
          matchedFields.add(field.name);
        }
      }
      score += best;
      return best > 0;
    });
    if (matchesAll)
      results.push({ artwork, score, matchedFields: [...matchedFields] });
  }
  return tokens.length
    ? results.sort(
        (a, b) =>
          b.score - a.score ||
          b.artwork.createdAt.localeCompare(a.artwork.createdAt),
      )
    : results;
}

export function getAllTags(
  artworks: Artwork[],
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const artwork of artworks)
    for (const tag of artwork.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"));
}
