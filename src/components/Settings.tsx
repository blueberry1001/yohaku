import { useRef, useState } from "react";
import {
  IconPalette,
  IconDatabase,
  IconFolderOpen,
  IconFilePlus,
  IconDownload,
  IconUpload,
  IconBrandGoogle,
  IconLogout,
  IconDeviceDesktop,
  IconCheck,
} from "@tabler/icons-react";
import { Modal, downloadText } from "./ui";
import type { useLibrary } from "../lib/useLibrary";
export type Theme = "paper" | "night" | "sage" | "blue";
export function Settings({
  library,
  theme,
  setTheme,
  density,
  setDensity,
  onClose,
  notify,
}: {
  library: ReturnType<typeof useLibrary>;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  density: string;
  setDensity: (v: string) => void;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null),
    [error, setError] = useState("");
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setError("");
    try {
      const result = await fn();
      if (result !== false && message) notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作できませんでした。");
    }
  };
  return (
    <Modal title="設定" onClose={onClose}>
      <div className="settings-content">
        <section>
          <h3>
            <IconPalette size={19} />
            見た目
          </h3>
          <div className="theme-options">
            {(
              [
                { id: "paper", name: "紙", colors: ["#f6f5f1", "#262722"] },
                { id: "night", name: "夜", colors: ["#20211e", "#ecece4"] },
                { id: "sage", name: "苔", colors: ["#f4f5ef", "#546344"] },
                { id: "blue", name: "藍", colors: ["#f1f3f7", "#3c5272"] },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={theme === t.id ? "selected" : ""}
                onClick={() => setTheme(t.id)}
                aria-pressed={theme === t.id}
              >
                <span
                  className="theme-swatch"
                  style={{ background: t.colors[0], borderColor: t.colors[1] }}
                >
                  <span style={{ background: t.colors[1] }} />
                  {theme === t.id && (
                    <IconCheck size={15} style={{ color: t.colors[1] }} />
                  )}
                </span>
                {t.name}
              </button>
            ))}
          </div>
          <div className="setting-row">
            <label htmlFor="density">表示密度</label>
            <select
              id="density"
              value={density}
              onChange={(e) => setDensity(e.target.value)}
            >
              <option value="comfortable">ゆったり</option>
              <option value="compact">コンパクト</option>
            </select>
          </div>
        </section>
        <section>
          <h3>
            <IconDatabase size={19} />
            保存先
          </h3>
          <div className="storage-info">
            <span className="status-dot" />
            <span>{library.storageLabel}</span>
          </div>
          {library.mode === "demo" && (
            <p className="setting-help">
              サンプルの変更は終了すると消えます。変更を残すには「DBを書き出す」を選んでください。
            </p>
          )}
          <div className="settings-actions">
            {!library.cloudConfigured && (
              <>
                <button
                  className="button"
                  disabled={library.busy}
                  onClick={() =>
                    void act(library.createDatabase, "DBを作成しました")
                  }
                >
                  <IconFilePlus size={18} />
                  新しいDB
                </button>
                <button
                  className="button"
                  disabled={library.busy}
                  onClick={() =>
                    void act(library.openDatabase, "DBを開きました")
                  }
                >
                  <IconFolderOpen size={18} />
                  DBを開く
                </button>
                <button
                  className="button"
                  disabled={library.busy}
                  onClick={() =>
                    void act(library.saveDatabaseAs, "DBを書き出しました")
                  }
                >
                  <IconDownload size={18} />
                  DBを書き出す
                </button>
              </>
            )}
            {library.mode === "file" && (
              <p className="setting-help">
                変更は開いた.dbファイルに保存されます。
              </p>
            )}
            {!library.fileSupported && !library.cloudConfigured && (
              <p className="setting-help">
                DBファイルの直接保存にはChrome・EdgeまたはWindows版をご利用ください。
              </p>
            )}
          </div>
          <div className="settings-actions secondary-actions">
            <button
              className="button small"
              onClick={() => {
                downloadText(library.exportLibrary(), "yohaku-backup.json");
                notify("JSONを書き出しました");
              }}
            >
              <IconDownload size={16} />
              JSON
            </button>
            <button
              className="button small"
              disabled={library.busy}
              onClick={() => upload.current?.click()}
            >
              <IconUpload size={16} />
              JSONを読み込む
            </button>
            <input
              ref={upload}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void act(async () => {
                    if (file.size > 5 * 1024 * 1024)
                      throw new Error("5MB以下のJSONを選んでください。");
                    return library.importLibrary(await file.text());
                  }, "作品を読み込みました");
                e.target.value = "";
              }}
            />
          </div>
        </section>
        <section>
          <h3>
            <IconBrandGoogle size={19} />
            共同編集
          </h3>
          {library.cloudConfigured ? (
            <>
              <div className="storage-info">
                {library.user?.name ?? "未ログイン"}
              </div>
              <button
                className="button"
                onClick={() =>
                  void act(library.user ? library.signOut : library.signIn)
                }
              >
                {library.user ? (
                  <IconLogout size={18} />
                ) : (
                  <IconBrandGoogle size={18} />
                )}{" "}
                {library.user ? "ログアウト" : "Googleでログイン"}
              </button>
            </>
          ) : (
            <>
              <p className="setting-help">
                {library.mode === "desktop"
                  ? "共同編集はWeb版で使えます。Windows版はローカルDBに保存します。"
                  : "Supabaseを接続すると、Googleログインで共有できます。"}
              </p>
              <a
                className="text-link"
                href="https://github.com/blueberry1001/yohaku/blob/main/docs/SETUP.md"
                target="_blank"
                rel="noreferrer"
              >
                接続手順
              </a>
            </>
          )}
        </section>
        {library.mode !== "desktop" && (
          <a
            className="desktop-download"
            href="https://github.com/blueberry1001/yohaku/releases/latest"
            target="_blank"
            rel="noreferrer"
          >
            <IconDeviceDesktop size={22} />
            <span>Windows版</span>
            <IconDownload size={18} />
          </a>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
