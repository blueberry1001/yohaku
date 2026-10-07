import { describe, expect, it } from "vitest";
import { normalizeSearch, searchArtworks } from "./search";
import {
  parseLibraryExport,
  prepareImport,
  serializeLibrary,
  validateDraft,
  validateUrl,
} from "./storage";
import type { Artwork, Comment } from "./types";

const artwork: Artwork = {
  id: "sample-1",
  title: "夜の散歩",
  url: "https://example.com/work",
  creator: "studio K",
  kind: "illustration",
  tags: ["ブルー", "静けさ"],
  description: "光と影の研究",
  notes: "逆光で輪郭を見せる",
  collection: "色彩",
  favorite: false,
  status: "inbox",
  positionX: 100,
  positionY: 200,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  createdBy: "local",
  revision: 1,
};
const comment: Comment = {
  id: "comment-1",
  artworkId: artwork.id,
  body: "遠近感が映画みたい",
  authorId: "local",
  authorName: "あなた",
  createdAt: artwork.createdAt,
};

describe("Japanese reference search", () => {
  it("normalizes width, latin case and kana", () => {
    expect(normalizeSearch(" ＢＬＵＥ　ﾌﾞﾙｰ ")).toBe("blue ぶるー");
    expect(searchArtworks([artwork], [], "ぶるー")).toHaveLength(1);
  });
  it("matches synonym AND queries across fields, not just title", () => {
    expect(
      searchArtworks([artwork], [], "青 静か 逆光")[0].matchedFields,
    ).toEqual(expect.arrayContaining(["タグ", "メモ"]));
    expect(searchArtworks([artwork], [], "青 赤")).toHaveLength(0);
  });
  it("indexes discussions and attributes the match", () => {
    expect(
      searchArtworks([artwork], [comment], "遠近感")[0].matchedFields,
    ).toContain("コメント");
    expect(searchArtworks([artwork], [], "遠近感")).toHaveLength(0);
  });
  it("applies filters and ranks title ahead of notes", () => {
    const other = { ...artwork, id: "sample-2", title: "逆光の森" };
    expect(searchArtworks([artwork, other], [], "逆光")[0].artwork.id).toBe(
      "sample-2",
    );
    expect(searchArtworks([artwork], [], "", { favorite: true })).toHaveLength(
      0,
    );
    expect(
      searchArtworks([artwork], [], "", { tags: ["ぶるー"] }),
    ).toHaveLength(1);
  });
});

describe("import and link boundaries", () => {
  it("rejects executable URLs, embedded credentials and non-web schemas", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///C:/secret",
      "https://user:password@example.com",
    ])
      expect(() => validateUrl(url)).toThrow();
    expect(validateUrl(" https://x.com/artist/status/123 ")).toBe(
      "https://x.com/artist/status/123",
    );
  });
  it("round-trips structured notes, positions and comments", () => {
    expect(
      parseLibraryExport(
        serializeLibrary({ artworks: [artwork], comments: [comment] }),
      ),
    ).toEqual({ artworks: [artwork], comments: [comment] });
  });
  it("keeps maximum-length imported author names valid across repeated imports", () => {
    const state = {
      artworks: [artwork],
      comments: [{ ...comment, authorName: "あ".repeat(200) }],
    };
    const once = prepareImport(state);
    const twice = prepareImport(parseLibraryExport(serializeLibrary(once)));
    expect(
      parseLibraryExport(serializeLibrary(twice)).comments[0].authorName,
    ).toHaveLength(200);
  });
  it("rejects duplicate IDs, orphan comments and unsafe imported images", () => {
    expect(() =>
      parseLibraryExport(
        serializeLibrary({ artworks: [artwork, artwork], comments: [] }),
      ),
    ).toThrow("重複");
    expect(() =>
      parseLibraryExport(
        serializeLibrary({ artworks: [], comments: [comment] }),
      ),
    ).toThrow("関連付け");
    expect(() =>
      validateDraft({ ...artwork, imageUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() => validateDraft({ ...artwork, positionX: Infinity })).toThrow();
  });
});
