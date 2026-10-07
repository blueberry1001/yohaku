import { useState, type FormEvent } from "react";
import { IconLink, IconCheck, IconChevronDown } from "@tabler/icons-react";
import type {
  Artwork,
  ArtworkDraft,
  ArtworkKind,
  ReviewStatus,
} from "../lib/types";
import { Modal } from "./ui";
import { kinds, statuses } from "./ArtworkCard";
export function ArtworkEditor({
  artwork,
  collections,
  onSave,
  onClose,
  busy,
}: {
  artwork?: Artwork;
  collections: string[];
  onSave: (draft: ArtworkDraft) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [url, setUrl] = useState(artwork?.url ?? ""),
    [title, setTitle] = useState(artwork?.title ?? ""),
    [creator, setCreator] = useState(artwork?.creator ?? ""),
    [kind, setKind] = useState<ArtworkKind>(artwork?.kind ?? "illustration"),
    [tags, setTags] = useState(artwork?.tags.join(", ") ?? ""),
    [collection, setCollection] = useState(artwork?.collection ?? ""),
    [description, setDescription] = useState(artwork?.description ?? ""),
    [notes, setNotes] = useState(artwork?.notes ?? ""),
    [imageUrl, setImageUrl] = useState(artwork?.imageUrl ?? ""),
    [status, setStatus] = useState<ReviewStatus>(artwork?.status ?? "inbox"),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onSave({
        title,
        url,
        creator,
        kind,
        tags: tags
          .split(/[,、\n]/)
          .map((t) => t.trim())
          .filter(Boolean),
        collection,
        description,
        notes,
        imageUrl: imageUrl || undefined,
        favorite: artwork?.favorite ?? false,
        status,
        positionX: artwork?.positionX ?? Math.round(Math.random() * 100 + 70),
        positionY: artwork?.positionY ?? Math.round(Math.random() * 100 + 70),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした。");
    }
  };
  const parseLink = (value: string) => {
    setUrl(value);
    try {
      const u = new URL(value);
      if (["youtube.com", "www.youtube.com", "youtu.be"].includes(u.hostname)) {
        setKind("video");
        const id =
          u.hostname === "youtu.be"
            ? u.pathname.slice(1)
            : u.searchParams.get("v");
        if (id && /^[\w-]{11}$/.test(id))
          setImageUrl("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg");
      }
    } catch {
      /* typed URL is incomplete */
    }
  };
  return (
    <Modal title={artwork ? "作品を編集" : "リンクを追加"} onClose={onClose}>
      <form className="editor-form" onSubmit={submit}>
        <label>
          リンク
          <div className="input-with-icon">
            <IconLink size={18} />
            <input
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => parseLink(e.target.value)}
              placeholder="https://x.com/…"
              maxLength={2000}
            />
          </div>
        </label>
        <label>
          タイトル
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="作品の名前"
            maxLength={200}
          />
        </label>
        <div className="field-row">
          <label>
            作者
            <input
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            種類
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ArtworkKind)}
            >
              {Object.entries(kinds).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          タグ
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="青, 逆光, 余白"
            maxLength={1000}
          />
        </label>
        <div className="field-row">
          <label>
            コレクション
            <input
              list="collection-options"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder="未分類"
              maxLength={100}
            />
            <datalist id="collection-options">
              {collections.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            状態
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReviewStatus)}
            >
              {Object.entries(statuses).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          メモ
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="気になったところ"
            rows={3}
            maxLength={50000}
          />
        </label>
        <details open={Boolean(artwork?.imageUrl)}>
          <summary>
            画像・概要
            <IconChevronDown size={16} />
          </summary>
          <label>
            画像URL
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              maxLength={2000}
            />
          </label>
          <label>
            概要
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={10000}
            />
          </label>
          <small>Xなどの画像・タイトルは手動で登録します。</small>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            キャンセル
          </button>
          <button className="button primary" disabled={busy}>
            <IconCheck size={17} />
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
