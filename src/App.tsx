import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  IconLayoutGrid,
  IconLayoutBoard,
  IconHeart,
  IconClock,
  IconFolder,
  IconSearch,
  IconPlus,
  IconSettings,
  IconDatabase,
  IconFolderOpen,
  IconX,
  IconList,
  IconPhoto,
  IconMovie,
  IconCamera,
  IconLayout,
  IconMenu2,
  IconBrandGoogle,
  IconCheck,
  IconRefresh,
  IconFilterOff,
  IconArrowUpRight,
  IconFilePlus,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import { useLibrary } from "./lib/useLibrary";
import { searchArtworks } from "./lib/search";
import type { Artwork, ArtworkDraft, ArtworkKind } from "./lib/types";
import { sampleArtworks, sampleComments } from "./data/samples";
import { ArtworkCard } from "./components/ArtworkCard";
import { ArtworkEditor } from "./components/ArtworkEditor";
import { Detail } from "./components/Detail";
import { Board } from "./components/Board";
import { Settings, type Theme } from "./components/Settings";
import { IconButton } from "./components/ui";
type View = "gallery" | "board" | "list";
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem("yohaku-ui-" + key) ?? fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const library = useLibrary(sampleArtworks, sampleComments);
  const [query, setQuery] = useState(""),
    deferredQuery = useDeferredValue(query),
    [kind, setKind] = useState<ArtworkKind | "all">("all"),
    [tags, setTags] = useState<string[]>([]),
    [collection, setCollection] = useState(""),
    [scope, setScope] = useState("all"),
    [view, setView] = useState<View>("gallery"),
    [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Artwork | null | undefined>(undefined),
    [settings, setSettings] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [notice, setNotice] = useState(""),
    [theme, setTheme] = useState<Theme>(preference("theme", "paper") as Theme),
    [density, setDensity] = useState(preference("density", "comfortable"));
  const input = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    clearTimeout(timer.current);
    setNotice(text);
    timer.current = setTimeout(() => setNotice(""), 3500);
  };
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      const result = await fn();
      if (result !== false && message) notify(message);
      return result;
    } catch (e) {
      notify(e instanceof Error ? e.message : "操作できませんでした。");
      return undefined;
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("yohaku-ui-theme", theme);
      localStorage.setItem("yohaku-ui-density", density);
    } catch {
      /* visual preferences are optional */
    }
  }, [theme, density]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      clearTimeout(timer.current);
    };
  }, []);
  const collections = useMemo(
    () =>
      [
        ...new Set(library.artworks.map((a) => a.collection).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "ja")),
    [library.artworks],
  );
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    library.artworks.forEach((a) =>
      a.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)),
    );
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [library.artworks]);
  const results = useMemo(() => {
    const list = searchArtworks(
      library.artworks,
      library.comments,
      deferredQuery,
      {
        kind,
        collection: collection || undefined,
        tags,
        favorite: scope === "favorites" ? true : undefined,
        status: scope === "inbox" ? "inbox" : undefined,
      },
    );
    if (sort === "title")
      return list.sort((a, b) =>
        a.artwork.title.localeCompare(b.artwork.title, "ja"),
      );
    if (sort === "oldest")
      return list.sort((a, b) =>
        a.artwork.createdAt.localeCompare(b.artwork.createdAt),
      );
    if (sort === "updated")
      return list.sort((a, b) =>
        b.artwork.updatedAt.localeCompare(a.artwork.updatedAt),
      );
    if (!deferredQuery)
      return list.sort((a, b) =>
        b.artwork.createdAt.localeCompare(a.artwork.createdAt),
      );
    return list;
  }, [
    library.artworks,
    library.comments,
    deferredQuery,
    kind,
    collection,
    tags,
    scope,
    sort,
  ]);
  const selectedArtwork = library.artworks.find((a) => a.id === selected);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    library.comments.forEach((c) =>
      map.set(c.artworkId, (map.get(c.artworkId) ?? 0) + 1),
    );
    return map;
  }, [library.comments]);
  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  const navigate = (next: string, col = "") => {
    setScope(next);
    setCollection(col);
    setMobileNav(false);
  };
  const clearFilters = () => {
    setQuery("");
    setTags([]);
    setKind("all");
    setCollection("");
    setScope("all");
  };
  const heading =
    collection ||
    (scope === "favorites"
      ? "お気に入り"
      : scope === "inbox"
        ? "あとで見る"
        : view === "board"
          ? "ボード"
          : "ライブラリ");
  const filtered = Boolean(
    query || tags.length || kind !== "all" || collection || scope !== "all",
  );
  return (
    <div className={`app density-${density}`}>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="メニューを閉じる"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <button
          className="brand"
          onClick={() => {
            navigate("all");
            setView("gallery");
          }}
          aria-label="余白 ライブラリ"
        >
          <span className="brand-mark">
            <i />
            <i />
          </span>
          <span>
            <strong>余白</strong>
            <small>Y O H A K U</small>
          </span>
        </button>
        <nav aria-label="ライブラリ">
          <button
            className={
              scope === "all" && !collection ? "nav-item active" : "nav-item"
            }
            onClick={() => navigate("all")}
          >
            <IconLayoutGrid />
            <span>すべての作品</span>
            <small>{library.artworks.length}</small>
          </button>
          <button
            className={scope === "inbox" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("inbox")}
          >
            <IconClock />
            <span>あとで見る</span>
          </button>
          <button
            className={scope === "favorites" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("favorites")}
          >
            <IconHeart />
            <span>お気に入り</span>
          </button>
        </nav>
        <div className="sidebar-section">
          <span>コレクション</span>
        </div>
        <nav aria-label="コレクション">
          {collections.map((c) => (
            <button
              key={c}
              className={collection === c ? "nav-item active" : "nav-item"}
              onClick={() => navigate("all", c)}
            >
              <IconFolder />
              <span>{c}</span>
            </button>
          ))}
          {collections.length === 0 && (
            <span className="empty-collections">まだありません</span>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="storage-button" onClick={() => setSettings(true)}>
            <IconDatabase size={18} />
            <span>
              {library.mode === "demo"
                ? "サンプル"
                : library.mode === "cloud"
                  ? "共有ライブラリ"
                  : library.storageLabel}
            </span>
            <span className={`status-dot ${library.busy ? "saving" : ""}`} />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setSettings(true);
              setMobileNav(false);
            }}
          >
            <IconSettings />
            <span>設定</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="heading-group">
            <IconButton
              className="mobile-menu"
              label="メニュー"
              onClick={() => setMobileNav(true)}
            >
              <IconMenu2 />
            </IconButton>
            <h1>{heading}</h1>
            <span className="count-label">{results.length}</span>
          </div>
          <div className="header-actions">
            {library.mode === "demo" && (
              <span className="demo-label">サンプル</span>
            )}
            <IconButton
              label="DBを開く"
              onClick={() => void act(library.openDatabase, "DBを開きました")}
              disabled={library.cloudConfigured || library.busy}
            >
              <IconFolderOpen />
            </IconButton>
            {library.cloudConfigured && !library.user && (
              <IconButton
                label="Googleでログイン"
                onClick={() => void act(library.signIn)}
              >
                <IconBrandGoogle />
              </IconButton>
            )}
            <button
              className="button primary add-button"
              aria-label="リンクを追加"
              disabled={library.cloudConfigured && !library.ready}
              onClick={() => setEditing(null)}
            >
              <IconPlus size={20} />
              <span>リンクを追加</span>
            </button>
          </div>
        </header>
        <div className="search-row">
          <div className="search-box">
            <IconSearch size={21} />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="作品・タグ・メモを検索"
              aria-label="作品・タグ・メモを検索"
            />
            {query ? (
              <IconButton label="検索をクリア" onClick={() => setQuery("")}>
                <IconX size={17} />
              </IconButton>
            ) : (
              <kbd>Ctrl K</kbd>
            )}
          </div>
          <div className="view-switch" aria-label="表示形式">
            {(
              [
                { id: "gallery", label: "ギャラリー", icon: IconLayoutGrid },
                { id: "board", label: "ボード", icon: IconLayoutBoard },
                { id: "list", label: "リスト", icon: IconList },
              ] as const
            ).map((item) => (
              <IconButton
                key={item.id}
                label={item.label}
                aria-pressed={view === item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
              >
                <item.icon size={20} />
              </IconButton>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <div className="kind-tabs" aria-label="作品の種類">
            {(
              [
                { id: "all", name: "すべて", icon: IconLayoutGrid },
                { id: "illustration", name: "イラスト", icon: IconPhoto },
                { id: "video", name: "映像", icon: IconMovie },
                { id: "photo", name: "写真", icon: IconCamera },
                { id: "design", name: "デザイン", icon: IconLayout },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-pressed={kind === item.id}
                className={kind === item.id ? "active" : ""}
                onClick={() => setKind(item.id)}
              >
                <item.icon size={16} />
                {item.name}
              </button>
            ))}
          </div>
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="並べ替え"
          >
            <option value="newest">追加した順</option>
            <option value="oldest">古い順</option>
            <option value="updated">更新した順</option>
            <option value="title">タイトル順</option>
          </select>
        </div>
        <div className="tag-row">
          {popularTags.map((t) => (
            <button
              key={t}
              className={tags.includes(t) ? "tag active" : "tag"}
              onClick={() => toggleTag(t)}
              aria-pressed={tags.includes(t)}
            >
              {tags.includes(t) && <IconCheck size={12} />} {t}
            </button>
          ))}
          {filtered && (
            <IconButton label="絞り込みを解除" onClick={clearFilters}>
              <IconFilterOff size={17} />
            </IconButton>
          )}
        </div>
        {library.mode === "demo" && (
          <div className="demo-bar">
            <span>
              <IconDatabase size={16} />
              未保存のサンプル
            </span>
            <button
              onClick={() =>
                void act(library.createDatabase, "DBを作成しました")
              }
              disabled={library.busy}
            >
              <IconFilePlus size={15} />
              自分のDBを作る
              <IconArrowUpRight size={14} />
            </button>
          </div>
        )}
        {library.error && (
          <div className="error-bar" role="alert">
            <span>{library.error}</span>
            <IconButton
              label="再読み込み"
              onClick={() => void library.refresh()}
            >
              <IconRefresh size={17} />
            </IconButton>
            <IconButton label="エラーを閉じる" onClick={library.clearError}>
              <IconX size={17} />
            </IconButton>
          </div>
        )}
        {library.loading ? (
          <div className="empty-state">
            <span className="spinner" />
            <p>読み込み中</p>
          </div>
        ) : library.cloudConfigured && !library.user ? (
          <div className="empty-state">
            <IconBrandGoogle size={36} />
            <h2>共有ライブラリ</h2>
            <button
              className="button primary"
              onClick={() => void act(library.signIn)}
            >
              Googleでログイン
            </button>
          </div>
        ) : view === "board" ? (
          <Board
            artworks={results.map((r) => r.artwork)}
            onOpen={setSelected}
            onMove={(art, x, y) =>
              act(() =>
                library.updateArtwork(
                  art.id,
                  { positionX: x, positionY: y },
                  art.revision,
                ),
              )
            }
          />
        ) : results.length === 0 ? (
          <div className="empty-state">
            <IconSearch size={36} stroke={1} />
            <h2>{filtered ? "見つかりませんでした" : "作品を集めよう"}</h2>
            {filtered ? (
              <button className="button" onClick={clearFilters}>
                条件をクリア
              </button>
            ) : (
              <button
                className="button primary"
                onClick={() => setEditing(null)}
              >
                <IconPlus size={18} />
                リンクを追加
              </button>
            )}
          </div>
        ) : (
          <div className={`gallery ${view === "list" ? "list-view" : ""}`}>
            {results.map(({ artwork, matchedFields }) => (
              <ArtworkCard
                key={artwork.id}
                artwork={artwork}
                count={counts.get(artwork.id) ?? 0}
                onOpen={() => setSelected(artwork.id)}
                onFavorite={() =>
                  void act(() =>
                    library.updateArtwork(
                      artwork.id,
                      { favorite: !artwork.favorite },
                      artwork.revision,
                    ),
                  )
                }
                onTag={toggleTag}
                matchedFields={query ? matchedFields : []}
              />
            ))}
          </div>
        )}
        {library.mode === "demo" && view !== "board" && (
          <footer className="library-footer">
            <span>パブリックドメイン作品 / 練習用メモ</span>
            <a
              href="https://github.com/blueberry1001/yohaku/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              <IconDeviceDesktop size={15} />
              Windows版
              <IconArrowUpRight size={13} />
            </a>
          </footer>
        )}
      </main>
      {editing !== undefined && (
        <ArtworkEditor
          artwork={editing ?? undefined}
          collections={collections}
          busy={library.busy}
          onClose={() => setEditing(undefined)}
          onSave={async (draft: ArtworkDraft) => {
            if (editing)
              await library.updateArtwork(editing.id, draft, editing.revision);
            else
              await library.addArtwork({
                ...draft,
                positionX: library.artworks.length
                  ? Math.max(...library.artworks.map((a) => a.positionX)) + 330
                  : 60,
                positionY: 60,
              });
            setEditing(undefined);
            notify(
              library.mode === "demo"
                ? "サンプル内で更新しました"
                : "保存しました",
            );
          }}
        />
      )}
      {selectedArtwork && editing === undefined && (
        <Detail
          key={selectedArtwork.id}
          artwork={selectedArtwork}
          comments={library.comments
            .filter((c) => c.artworkId === selectedArtwork.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing(selectedArtwork)}
          onSave={(patch, revision) =>
            library.updateArtwork(selectedArtwork.id, patch, revision)
          }
          onDelete={async () => {
            await library.deleteArtwork(
              selectedArtwork.id,
              selectedArtwork.revision,
            );
            setSelected(null);
            notify("削除しました");
          }}
          onComment={(body) => library.addComment(selectedArtwork.id, body)}
          onDeleteComment={library.deleteComment}
          userId={library.user?.id ?? "local"}
          busy={library.busy}
          onTag={(t) => {
            setSelected(null);
            setTags([t]);
          }}
        />
      )}
      {settings && (
        <Settings
          library={library}
          theme={theme}
          setTheme={setTheme}
          density={density}
          setDensity={setDensity}
          onClose={() => setSettings(false)}
          notify={notify}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <IconCheck size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
