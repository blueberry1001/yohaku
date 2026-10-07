import { useEffect, useState } from "react";
import {
  IconExternalLink,
  IconPencil,
  IconTrash,
  IconHeart,
  IconSend,
  IconCheck,
  IconNotes,
  IconMessageCircle,
  IconPlayerPlay,
} from "@tabler/icons-react";
import type { Artwork, ArtworkPatch, Comment } from "../lib/types";
import { Media, kinds, statuses } from "./ArtworkCard";
import { Modal, IconButton } from "./ui";
function videoEmbed(url: string) {
  try {
    const u = new URL(url);
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : ["youtube.com", "www.youtube.com"].includes(u.hostname)
          ? u.searchParams.get("v")
          : null;
    return id && /^[\w-]{11}$/.test(id)
      ? "https://www.youtube-nocookie.com/embed/" + id
      : null;
  } catch {
    return null;
  }
}
export function Detail({
  artwork,
  comments,
  onClose,
  onEdit,
  onSave,
  onDelete,
  onComment,
  onDeleteComment,
  userId,
  busy,
  onTag,
}: {
  artwork: Artwork;
  comments: Comment[];
  onClose: () => void;
  onEdit: () => void;
  onSave: (patch: ArtworkPatch, revision: number) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onComment: (body: string) => Promise<unknown>;
  onDeleteComment: (id: string) => Promise<unknown>;
  userId: string;
  busy: boolean;
  onTag: (tag: string) => void;
}) {
  const [notes, setNotes] = useState(artwork.notes),
    [baseline, setBaseline] = useState({
      notes: artwork.notes,
      revision: artwork.revision,
    }),
    [comment, setComment] = useState(""),
    [tab, setTab] = useState<"notes" | "discussion">("notes"),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [playing, setPlaying] = useState(false),
    [saved, setSaved] = useState(false);
  const dirty = notes !== baseline.notes;
  const conflict =
    artwork.revision !== baseline.revision && artwork.notes !== baseline.notes;
  useEffect(() => {
    if (artwork.revision === baseline.revision) return;
    if (!dirty) {
      setNotes(artwork.notes);
      setBaseline({ notes: artwork.notes, revision: artwork.revision });
    } else if (artwork.notes === baseline.notes)
      setBaseline({ notes: artwork.notes, revision: artwork.revision });
  }, [
    artwork.notes,
    artwork.revision,
    baseline.notes,
    baseline.revision,
    dirty,
  ]);
  const leave = (next: () => void) => {
    if (!dirty || window.confirm("未保存のメモを破棄しますか？")) next();
  };
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした。");
    }
  };
  const embed = videoEmbed(artwork.url);
  return (
    <Modal title={artwork.title} wide onClose={() => leave(onClose)}>
      <div className="detail-grid">
        <div className="detail-left">
          {playing && embed ? (
            <iframe
              className="video-frame"
              src={embed}
              title={artwork.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <Media key={artwork.imageUrl} artwork={artwork} detail />
          )}
          <div className="detail-media-actions">
            <span>{kinds[artwork.kind]}</span>
            {embed && (
              <button
                className="button small"
                onClick={() => setPlaying(!playing)}
              >
                <IconPlayerPlay size={16} />
                {playing ? "画像に戻る" : "再生"}
              </button>
            )}
            <a
              className="button small"
              href={artwork.url}
              target="_blank"
              rel="noreferrer"
            >
              <IconExternalLink size={16} />
              元の作品
            </a>
          </div>
          <h3>{artwork.title}</h3>
          <p className="detail-author">{artwork.creator}</p>
          {artwork.description && (
            <p className="detail-description">{artwork.description}</p>
          )}
          <div className="card-tags">
            {artwork.tags.map((t) => (
              <button key={t} onClick={() => leave(() => onTag(t))}>
                {t}
              </button>
            ))}
          </div>
          <dl className="metadata">
            <div>
              <dt>コレクション</dt>
              <dd>{artwork.collection || "未分類"}</dd>
            </div>
            <div>
              <dt>状態</dt>
              <dd>{statuses[artwork.status]}</dd>
            </div>
            <div>
              <dt>追加日</dt>
              <dd>{new Date(artwork.createdAt).toLocaleDateString("ja-JP")}</dd>
            </div>
          </dl>
          <div className="detail-actions">
            <IconButton
              label={
                artwork.favorite ? "お気に入りから外す" : "お気に入りに追加"
              }
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = (await onSave(
                    { favorite: !artwork.favorite },
                    artwork.revision,
                  )) as Artwork | undefined;
                  if (result)
                    setBaseline((current) =>
                      result.notes === current.notes
                        ? { notes: result.notes, revision: result.revision }
                        : current,
                    );
                })
              }
            >
              <IconHeart fill={artwork.favorite ? "currentColor" : "none"} />
            </IconButton>
            <IconButton label="編集" onClick={() => leave(onEdit)}>
              <IconPencil />
            </IconButton>
            <IconButton
              label="作品を削除"
              onClick={() => setConfirmDelete(true)}
            >
              <IconTrash />
            </IconButton>
          </div>
          {confirmDelete && (
            <div className="delete-confirm">
              <p>作品とコメントを削除しますか？</p>
              <button
                className="button small"
                onClick={() => setConfirmDelete(false)}
              >
                戻る
              </button>
              <button
                className="button small danger"
                disabled={busy}
                onClick={() => void act(onDelete)}
              >
                削除する
              </button>
            </div>
          )}
        </div>
        <div className="detail-right">
          <div className="detail-tabs">
            <button
              className={tab === "notes" ? "active" : ""}
              onClick={() => setTab("notes")}
            >
              <IconNotes size={18} />
              メモ
            </button>
            <button
              className={tab === "discussion" ? "active" : ""}
              onClick={() => setTab("discussion")}
            >
              <IconMessageCircle size={18} />
              議論<span>{comments.length}</span>
            </button>
          </div>
          {tab === "notes" ? (
            <div className="note-editor">
              <div className="note-prompts">
                {["色・光", "構図", "質感", "動き", "気分"].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setNotes((n) => n + (n ? "\n" : "") + prompt + "｜");
                      setSaved(false);
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <textarea
                aria-label="分析メモ"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setSaved(false);
                }}
                placeholder="気になったところ"
                maxLength={50000}
              />
              {conflict && dirty && (
                <p className="form-error">
                  別の変更があります。メモをコピーしてから開き直してください。
                </p>
              )}
              <div className="note-footer">
                <small>{notes.length.toLocaleString()} 文字</small>
                <button
                  className="button primary small"
                  disabled={busy || !dirty}
                  onClick={() =>
                    void act(async () => {
                      const result = (await onSave(
                        { notes },
                        baseline.revision,
                      )) as Artwork | undefined;
                      if (result) {
                        setBaseline({
                          notes: result.notes,
                          revision: result.revision,
                        });
                        setSaved(true);
                      }
                    })
                  }
                >
                  <IconCheck size={16} />
                  {saved && !dirty ? "保存済み" : "保存"}
                </button>
              </div>
            </div>
          ) : (
            <div className="discussion">
              <div className="comments">
                {comments.length === 0 ? (
                  <div className="empty-discussion">
                    <IconMessageCircle size={28} />
                    <span>最初のコメントをどうぞ</span>
                  </div>
                ) : (
                  comments.map((c) => (
                    <article className="comment" key={c.id}>
                      <header>
                        <span className="avatar small-avatar">
                          {c.authorName.slice(0, 1)}
                        </span>
                        <strong>{c.authorName}</strong>
                        <time>
                          {new Date(c.createdAt).toLocaleDateString("ja-JP", {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                        {c.authorId === userId && (
                          <IconButton
                            label="コメントを削除"
                            onClick={() => {
                              if (window.confirm("コメントを削除しますか？"))
                                void act(() => onDeleteComment(c.id));
                            }}
                          >
                            <IconTrash size={14} />
                          </IconButton>
                        )}
                      </header>
                      <p>{c.body}</p>
                    </article>
                  ))
                )}
              </div>
              <form
                className="comment-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim())
                    void act(async () => {
                      await onComment(comment);
                      setComment("");
                    });
                }}
              >
                <textarea
                  aria-label="コメント"
                  placeholder="コメントを書く"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={10000}
                />
                <button
                  className="icon-button primary"
                  title="コメントを送信"
                  aria-label="コメントを送信"
                  disabled={!comment.trim() || busy}
                >
                  <IconSend size={18} />
                </button>
              </form>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
