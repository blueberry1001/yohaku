import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  IconMinus,
  IconPlus,
  IconArrowsMaximize,
  IconHandStop,
  IconPointer,
  IconLayoutGrid,
  IconArrowUpRight,
  IconQuestionMark,
} from "@tabler/icons-react";
import type { Artwork } from "../lib/types";
import { Media } from "./ArtworkCard";
import { IconButton } from "./ui";
type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
type Gesture = {
  id: number;
  startX: number;
  startY: number;
  camera: Camera;
  artwork?: Artwork;
  originX: number;
  originY: number;
  moved: boolean;
};
type Pinch = {
  distance: number;
  camera: Camera;
  worldX: number;
  worldY: number;
};
const interactive = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      'button,a,input,textarea,select,dialog,[role="button"],[contenteditable="true"]',
    ),
  );
const clampZoom = (zoom: number) => Math.min(2.5, Math.max(0.15, zoom));

export function Board({
  artworks,
  onOpen,
  onMove,
}: {
  artworks: Artwork[];
  onOpen: (id: string) => void;
  onMove: (art: Artwork, x: number, y: number) => Promise<unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null),
    cameraRef = useRef<Camera>({ x: 40, y: 35, zoom: 0.8 }),
    gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>()),
    pinch = useRef<Pinch | null>(null),
    saving = useRef(new Set<string>());
  const lastTap = useRef<{
    id: string;
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const [camera, setCamera] = useState(cameraRef.current),
    [hand, setHand] = useState(false),
    [space, setSpace] = useState(false),
    [help, setHelp] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const commitCamera = (next: Camera) => {
    cameraRef.current = next;
    setCamera(next);
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const old = cameraRef.current,
      px = cx ?? r.width / 2,
      py = cy ?? r.height / 2,
      z = clampZoom(old.zoom * factor);
    commitCamera({
      zoom: z,
      x: px - ((px - old.x) * z) / old.zoom,
      y: py - ((py - old.y) * z) / old.zoom,
    });
  };
  const fit = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !artworks.length) return;
    const minX = Math.min(...artworks.map((a) => a.positionX ?? 0)),
      minY = Math.min(...artworks.map((a) => a.positionY ?? 0));
    const maxX = Math.max(...artworks.map((a) => (a.positionX ?? 0) + 280)),
      maxY = Math.max(...artworks.map((a) => (a.positionY ?? 0) + 300));
    const z = clampZoom(
      Math.min(
        1.2,
        (r.width - 90) / (maxX - minX),
        (r.height - 90) / (maxY - minY),
      ),
    );
    commitCamera({
      zoom: z,
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: (r.height - (maxY - minY) * z) / 2 - minY * z,
    });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(
          Math.exp(-e.deltaY * 0.008),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else {
        const c = cameraRef.current;
        commitCamera({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (interactive(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const startPinch = () => {
    const r = ref.current?.getBoundingClientRect(),
      points = [...pointers.current.values()];
    if (!r || points.length !== 2) return;
    const [a, b] = points,
      c = cameraRef.current,
      mx = (a.x + b.x) / 2 - r.left,
      my = (a.y + b.y) / 2 - r.top;
    pinch.current = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      camera: c,
      worldX: (mx - c.x) / c.zoom,
      worldY: (my - c.y) / c.zoom,
    };
    gesture.current = null;
    lastTap.current = null;
    setDrag(null);
  };
  const start = (e: ReactPointerEvent, artwork?: Artwork) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (interactive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (pointers.current.size >= 2) return;
    if (artwork && saving.current.has(artwork.id)) return;
    ref.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      camera: cameraRef.current,
      artwork: hand || space || e.button === 1 ? undefined : artwork,
      originX: artwork?.positionX ?? 0,
      originY: artwork?.positionY ?? 0,
      moved: false,
    };
  };
  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current) {
      const r = ref.current?.getBoundingClientRect(),
        points = [...pointers.current.values()];
      if (!r || points.length !== 2) return;
      const [a, b] = points,
        p = pinch.current,
        z = clampZoom(
          (p.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / p.distance,
        );
      commitCamera({
        zoom: z,
        x: (a.x + b.x) / 2 - r.left - p.worldX * z,
        y: (a.y + b.y) / 2 - r.top - p.worldY * z,
      });
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.startX,
      dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (g.artwork)
      setDrag({
        id: g.artwork.id,
        x: g.originX + dx / g.camera.zoom,
        y: g.originY + dy / g.camera.zoom,
      });
    else commitCamera({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
  };
  const release = (id: number) => {
    if (ref.current?.hasPointerCapture(id))
      ref.current.releasePointerCapture(id);
  };
  const end = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    release(e.pointerId);
    if (pinch.current) {
      pinch.current = null;
      gesture.current = null;
      lastTap.current = null;
      const remaining = [...pointers.current.entries()][0];
      if (remaining) {
        const [id, p] = remaining;
        gesture.current = {
          id,
          startX: p.x,
          startY: p.y,
          camera: cameraRef.current,
          originX: 0,
          originY: 0,
          moved: false,
        };
      }
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.artwork && g.moved) {
      lastTap.current = null;
      const art = g.artwork,
        x = Math.round(g.originX + (e.clientX - g.startX) / g.camera.zoom),
        y = Math.round(g.originY + (e.clientY - g.startY) / g.camera.zoom);
      saving.current.add(art.id);
      void onMove(art, x, y)
        .catch(() => {})
        .finally(() => {
          saving.current.delete(art.id);
          setDrag((current) => (current?.id === art.id ? null : current));
        });
    } else {
      setDrag(null);
      if (g.artwork) {
        const now = Date.now(),
          last = lastTap.current;
        if (
          last?.id === g.artwork.id &&
          now - last.time < 400 &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) < 12
        ) {
          lastTap.current = null;
          onOpen(g.artwork.id);
        } else
          lastTap.current = {
            id: g.artwork.id,
            time: now,
            x: e.clientX,
            y: e.clientY,
          };
      } else lastTap.current = null;
    }
  };
  const cancel = (e: ReactPointerEvent) => {
    pointers.current.clear();
    pinch.current = null;
    gesture.current = null;
    lastTap.current = null;
    setDrag(null);
    release(e.pointerId);
  };
  return (
    <div
      className={`board ${hand || space ? "hand-tool" : ""}`}
      ref={ref}
      onPointerDown={(e) => start(e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      tabIndex={0}
      aria-label="作品ボード"
      onKeyDown={(e) => {
        if (interactive(e.target)) return;
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomAt(1.2);
        }
        if (e.key === "-") {
          e.preventDefault();
          zoomAt(1 / 1.2);
        }
        if (e.key === "0") {
          e.preventDefault();
          fit();
        }
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          const c = cameraRef.current;
          commitCamera({
            ...c,
            x:
              c.x +
              (e.key === "ArrowLeft" ? 50 : e.key === "ArrowRight" ? -50 : 0),
            y:
              c.y +
              (e.key === "ArrowUp" ? 50 : e.key === "ArrowDown" ? -50 : 0),
          });
        }
      }}
      style={{
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
      }}
    >
      <div
        className="board-world"
        style={{
          transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`,
        }}
      >
        {artworks.map((art) => (
          <div
            key={art.id}
            className={`board-card ${drag?.id === art.id ? "dragging" : ""}`}
            onPointerDown={(e) => start(e, art)}
            style={{
              left: drag?.id === art.id ? drag.x : (art.positionX ?? 0),
              top: drag?.id === art.id ? drag.y : (art.positionY ?? 0),
            }}
          >
            <Media artwork={art} />
            <div className="board-card-caption">
              <span>{art.title}</span>
              <IconButton
                label={`${art.title}を開く`}
                onClick={() => onOpen(art.id)}
              >
                <IconArrowUpRight size={17} />
              </IconButton>
            </div>
            <div className="board-card-tags">
              {art.tags.slice(0, 3).join(" · ")}
            </div>
          </div>
        ))}
      </div>
      <div className="board-tools" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton
          label="選択ツール"
          aria-pressed={!hand}
          className={!hand ? "active" : ""}
          onClick={() => setHand(false)}
        >
          <IconPointer />
        </IconButton>
        <IconButton
          label="手のひらツール"
          aria-pressed={hand}
          className={hand ? "active" : ""}
          onClick={() => setHand(true)}
        >
          <IconHandStop />
        </IconButton>
        <span className="tool-separator" />
        <IconButton label="縮小" onClick={() => zoomAt(1 / 1.2)}>
          <IconMinus />
        </IconButton>
        <button
          className="zoom-value"
          onClick={() => zoomAt(1 / cameraRef.current.zoom)}
          title="100%に戻す"
          aria-label="100%に戻す"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <IconButton label="拡大" onClick={() => zoomAt(1.2)}>
          <IconPlus />
        </IconButton>
        <span className="tool-separator" />
        <IconButton label="全体を表示" onClick={fit}>
          <IconArrowsMaximize />
        </IconButton>
        <IconButton
          label="操作方法"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          <IconQuestionMark />
        </IconButton>
      </div>
      {help && (
        <div className="board-help">
          ドラッグ：移動
          <br />
          空白をドラッグ / Space：画面移動
          <br />
          スクロール：画面移動
          <br />
          Ctrl + スクロール / ＋ −：拡大縮小
          <br />
          2本指：拡大縮小・画面移動
          <br />
          0：全体表示 · ダブルクリック：詳細
        </div>
      )}
      {!artworks.length && (
        <div className="board-empty">
          <IconLayoutGrid size={32} />
          <span>作品がありません</span>
        </div>
      )}
    </div>
  );
}
