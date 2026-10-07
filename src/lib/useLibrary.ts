import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  Artwork,
  ArtworkDraft,
  ArtworkPatch,
  Comment,
  LibraryState,
  LibraryUser,
} from "./types";
import {
  addLocalComment,
  createArtwork,
  deleteLocalArtwork,
  deleteLocalComment,
  importLocalLibrary,
  parseLibraryExport,
  readLocalLibrary,
  saveLocalArtwork,
  seedLocalLibrary,
  serializeLibrary,
  updateLocalArtwork,
  withLocalLock,
} from "./storage";
import {
  addCloudArtwork,
  addCloudComment,
  cloudConfigured,
  deleteCloudArtwork,
  deleteCloudComment,
  getSupabase,
  importCloudLibrary,
  loadCloudLibrary,
  signInWithGoogle,
  updateCloudArtwork,
} from "./supabase";
import {
  createDatabaseFile,
  databaseStorageInfo,
  openDatabaseFile,
  saveDatabaseFileAs,
} from "./sqlite";
import { desktopAvailable, desktopCall } from "./desktop";

const EMPTY: LibraryState = { artworks: [], comments: [] };
function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "保存できませんでした。通信状態をご確認ください。";
}
function publicUser(user: User | null): LibraryUser | null {
  return user
    ? {
        id: user.id,
        email: user.email,
        name:
          user.user_metadata.full_name ||
          user.user_metadata.name ||
          user.email?.split("@")[0] ||
          "メンバー",
        avatarUrl: user.user_metadata.avatar_url,
      }
    : null;
}

export function useLibrary(
  initialArtworks: Artwork[] = [],
  initialComments: Comment[] = [],
) {
  const useCloud = cloudConfigured && !desktopAvailable;
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [user, setUser] = useState<LibraryUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<{
    mode: "demo" | "file" | "desktop" | "cloud";
    storageLabel: string;
    fileSupported: boolean;
  }>({
    mode: desktopAvailable ? "desktop" : useCloud ? "cloud" : "demo",
    storageLabel: desktopAvailable
      ? "SQLite データベース"
      : useCloud
        ? "共有ライブラリ"
        : "デモ · この画面を閉じると消えます",
    fileSupported: true,
  });
  const stateRef = useRef(state);
  const userRef = useRef(user);
  const fetchId = useRef(0);
  const initial = useRef({
    artworks: initialArtworks,
    comments: initialComments,
  });
  stateRef.current = state;
  userRef.current = user;

  const refresh = useCallback(async () => {
    const requestId = ++fetchId.current;
    try {
      const data = desktopAvailable
        ? await desktopCall<LibraryState>("load", {})
        : useCloud
          ? userRef.current
            ? await loadCloudLibrary()
            : EMPTY
          : readLocalLibrary();
      if (requestId === fetchId.current) {
        setState(data);
        setReady(!useCloud || Boolean(userRef.current));
        setError(null);
        if (!desktopAvailable && !useCloud) setStorage(databaseStorageInfo());
      }
    } catch (caught) {
      if (requestId === fetchId.current) {
        setError(errorMessage(caught));
        if (useCloud) {
          setState(EMPTY);
          setReady(false);
        }
      }
    } finally {
      if (requestId === fetchId.current) setLoading(false);
    }
  }, [useCloud]);

  useEffect(() => {
    let active = true;
    if (desktopAvailable) {
      void refresh();
      void desktopCall<{ name: string; path: string }>("databaseInfo", {})
        .then((info) => {
          if (active)
            setStorage({
              mode: "desktop",
              storageLabel: info.name,
              fileSupported: true,
            });
        })
        .catch((caught) => {
          if (active) setError(errorMessage(caught));
        });
      return () => {
        active = false;
        fetchId.current++;
      };
    }
    const supabase = useCloud ? getSupabase() : null;
    if (!supabase) {
      void seedLocalLibrary(initial.current.artworks, initial.current.comments)
        .then(() => {
          if (active) void refresh();
        })
        .catch((caught) => {
          if (active) {
            setError(errorMessage(caught));
            setLoading(false);
          }
        });
      return () => {
        active = false;
        fetchId.current++;
      };
    }
    const setAuthUser = (next: User | null) => {
      if (!active) return;
      const mapped = publicUser(next);
      userRef.current = mapped;
      setUser(mapped);
      if (!mapped) {
        ++fetchId.current;
        setState(EMPTY);
        setReady(false);
        setLoading(false);
      } else {
        setLoading(true);
        void refresh();
      }
    };
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setError(errorMessage(sessionError));
          setLoading(false);
        } else setAuthUser(data.session?.user ?? null);
      })
      .catch((caught) => {
        if (active) {
          setError(errorMessage(caught));
          setLoading(false);
        }
      });
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Run database work outside the Auth callback lock.
        queueMicrotask(() => setAuthUser(session?.user ?? null));
      },
    );
    return () => {
      active = false;
      ++fetchId.current;
      authListener.subscription.unsubscribe();
    };
  }, [refresh, useCloud]);

  useEffect(() => {
    const supabase = useCloud ? getSupabase() : null;
    if (!supabase || !user?.id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase
      .channel(`library-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "artworks" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        schedule,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") schedule();
      });
    window.addEventListener("focus", schedule);
    window.addEventListener("online", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("online", schedule);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, refresh, useCloud]);

  const run = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      if (useCloud && !userRef.current)
        throw new Error("Google アカウントでログインしてください。");
      setPending((count) => count + 1);
      setError(null);
      try {
        const result = await operation();
        await refresh();
        return result;
      } catch (caught) {
        setError(errorMessage(caught));
        throw new Error(errorMessage(caught));
      } finally {
        setPending((count) => count - 1);
      }
    },
    [refresh, useCloud],
  );

  const addArtwork = useCallback(
    (draft: ArtworkDraft) =>
      run(async () => {
        if (desktopAvailable)
          return desktopCall<Artwork>("createArtwork", draft);
        if (useCloud) return addCloudArtwork(draft);
        return withLocalLock(() => {
          const artwork = createArtwork(draft);
          saveLocalArtwork(artwork);
          return artwork;
        });
      }),
    [run, useCloud],
  );

  const updateArtwork = useCallback(
    (id: string, patch: ArtworkPatch, expectedRevision: number) =>
      run(async () => {
        if (desktopAvailable)
          return desktopCall<Artwork>("updateArtwork", {
            id,
            patch,
            expectedRevision,
          });
        if (!useCloud)
          return withLocalLock(() =>
            updateLocalArtwork(id, patch, expectedRevision),
          );
        const current = stateRef.current.artworks.find(
          (artwork) => artwork.id === id,
        );
        if (!current) throw new Error("作品が見つかりません。");
        return updateCloudArtwork(current, patch, expectedRevision);
      }),
    [run, useCloud],
  );

  const deleteArtwork = useCallback(
    (id: string, expectedRevision: number) =>
      run(async () => {
        if (desktopAvailable)
          return desktopCall<void>("deleteArtwork", { id, expectedRevision });
        if (useCloud) return deleteCloudArtwork(id, expectedRevision);
        return withLocalLock(() => deleteLocalArtwork(id, expectedRevision));
      }),
    [run, useCloud],
  );

  const addComment = useCallback(
    (artworkId: string, body: string) =>
      run(async () =>
        desktopAvailable
          ? desktopCall<Comment>("addComment", { artworkId, body })
          : useCloud
            ? addCloudComment(artworkId, body)
            : withLocalLock(() => addLocalComment(artworkId, body)),
      ),
    [run, useCloud],
  );
  const deleteComment = useCallback(
    (id: string) =>
      run(async () => {
        if (desktopAvailable) return desktopCall<void>("deleteComment", { id });
        if (useCloud) return deleteCloudComment(id);
        return withLocalLock(() => deleteLocalComment(id));
      }),
    [run, useCloud],
  );
  const importLibrary = useCallback(
    (json: string) =>
      run(async () => {
        const parsed = parseLibraryExport(json);
        if (desktopAvailable)
          return (await desktopCall<{ count: number }>("importLibrary", parsed))
            .count;
        return useCloud
          ? importCloudLibrary(parsed)
          : withLocalLock(() => importLocalLibrary(parsed));
      }),
    [run, useCloud],
  );
  const exportLibrary = useCallback(
    () => serializeLibrary(stateRef.current),
    [],
  );
  const signIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    }
  }, []);
  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(errorMessage(signOutError));
      throw signOutError;
    }
    userRef.current = null;
    ++fetchId.current;
    setUser(null);
    setState(EMPTY);
    setReady(false);
  }, []);

  const chooseDatabase = useCallback(
    async (
      action: "openDatabase" | "createDatabase" | "saveDatabaseAs",
    ): Promise<boolean> => {
      if (useCloud)
        throw new Error(
          "共有モードではクラウドに保存されます。ファイル版は Supabase 未設定のアプリで利用できます。",
        );
      setPending((count) => count + 1);
      setError(null);
      try {
        if (desktopAvailable) {
          const result = await desktopCall<
            (LibraryState & { name: string; path: string }) | null
          >(action, {});
          if (!result) return false;
          setStorage({
            mode: "desktop",
            storageLabel: result.name,
            fileSupported: true,
          });
        } else if (action === "openDatabase") {
          await openDatabaseFile((data) => {
            parseLibraryExport(serializeLibrary(data));
          });
        } else if (action === "createDatabase") await createDatabaseFile();
        else await saveDatabaseFileAs();
        await refresh();
        return true;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return false;
        setError(errorMessage(caught));
        throw new Error(errorMessage(caught));
      } finally {
        setPending((count) => count - 1);
      }
    },
    [refresh, useCloud],
  );

  return {
    ...state,
    ...storage,
    cloudConfigured: useCloud,
    user,
    loading,
    ready,
    busy: pending > 0,
    error,
    clearError: () => setError(null),
    addArtwork,
    updateArtwork,
    deleteArtwork,
    addComment,
    deleteComment,
    importLibrary,
    exportLibrary,
    signIn,
    signOut,
    refresh,
    openDatabase: () => chooseDatabase("openDatabase"),
    createDatabase: () => chooseDatabase("createDatabase"),
    saveDatabaseAs: () => chooseDatabase("saveDatabaseAs"),
  };
}
