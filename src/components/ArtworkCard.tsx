import { useEffect, useState } from "react";
import {
  IconHeart,
  IconMessageCircle,
  IconNotes,
  IconPhoto,
  IconPlayerPlay,
  IconExternalLink,
} from "@tabler/icons-react";
import type { Artwork } from "../lib/types";
import { IconButton } from "./ui";
export const kinds = {
  illustration: "イラスト",
  video: "映像",
  photo: "写真",
  design: "デザイン",
};
export const statuses = {
  inbox: "あとで見る",
  reviewing: "分析中",
  reviewed: "整理済み",
};
export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "リンク";
  }
}
export function Media({
  artwork,
  detail = false,
}: {
  artwork: Artwork;
  detail?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [artwork.imageUrl]);
  return (
    <div className={`artwork-media ${detail ? "detail-media" : ""}`}>
      {artwork.imageUrl && !broken ? (
        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="media-fallback">
          <IconPhoto size={40} stroke={1} />
          <span>{hostname(artwork.url)}</span>
        </div>
      )}
      {artwork.kind === "video" && (
        <span className="play-mark">
          <IconPlayerPlay size={24} />
        </span>
      )}
    </div>
  );
}
export function ArtworkCard({
  artwork,
  count,
  onOpen,
  onFavorite,
  onTag,
  matchedFields = [],
}: {
  artwork: Artwork;
  count: number;
  onOpen: () => void;
  onFavorite: () => void;
  onTag: (tag: string) => void;
  matchedFields?: string[];
}) {
  return (
    <article className="artwork-card">
      <button
        className="media-button"
        onClick={onOpen}
        aria-label={`${artwork.title}を開く`}
      >
        <Media artwork={artwork} />
      </button>
      <IconButton
        className={`favorite-button ${artwork.favorite ? "is-favorite" : ""}`}
        label={artwork.favorite ? "お気に入りから外す" : "お気に入りに追加"}
        onClick={onFavorite}
      >
        <IconHeart
          size={18}
          fill={artwork.favorite ? "currentColor" : "none"}
        />
      </IconButton>
      <div className="card-copy">
        <button className="card-title" onClick={onOpen}>
          {artwork.title}
        </button>
        <div className="card-author">
          <span>{artwork.creator || "作者未登録"}</span>
          <span className="source-name">{hostname(artwork.url)}</span>
        </div>
        <div className="card-tags">
          {artwork.tags.slice(0, 3).map((tag) => (
            <button key={tag} onClick={() => onTag(tag)}>
              {tag}
            </button>
          ))}
          {artwork.tags.length > 3 && <span>+{artwork.tags.length - 3}</span>}
        </div>
        <div className="card-bottom">
          <span title="メモ">
            <IconNotes size={14} />
            {artwork.notes ? 1 : 0}
          </span>
          <span title="コメント">
            <IconMessageCircle size={14} />
            {count}
          </span>
          {matchedFields.length > 0 && (
            <small>{matchedFields.slice(0, 2).join("・")}</small>
          )}
          <a
            href={artwork.url}
            target="_blank"
            rel="noreferrer"
            title="元の作品を開く"
            aria-label="元の作品を開く"
          >
            <IconExternalLink size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}
