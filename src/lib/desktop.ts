type DesktopReply = { id: string; result?: unknown; error?: string };
type WebView = {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    handler: (event: MessageEvent<DesktopReply>) => void,
  ): void;
};

declare global {
  interface Window {
    __YOHAKU_DESKTOP__?: boolean;
    chrome?: { webview?: WebView };
  }
}

export const desktopAvailable =
  typeof window !== "undefined" &&
  window.__YOHAKU_DESKTOP__ === true &&
  !!window.chrome?.webview;
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

if (desktopAvailable) {
  window.chrome!.webview!.addEventListener("message", (event) => {
    const reply = event.data;
    if (!reply || typeof reply.id !== "string") return;
    const request = pending.get(reply.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(reply.id);
    if (reply.error) request.reject(new Error(reply.error));
    else request.resolve(reply.result);
  });
}

export function desktopCall<T>(
  action: string,
  payload: unknown = {},
): Promise<T> {
  if (!desktopAvailable)
    return Promise.reject(new Error("Windows アプリでのみ利用できます。"));
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    // File dialogs may legitimately stay open while the user chooses a location.
    const timer = setTimeout(
      () => {
        pending.delete(id);
        reject(
          new Error(
            "Windows アプリからの応答がありません。データベースを開き直してください。",
          ),
        );
      },
      10 * 60 * 1000,
    );
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    try {
      window.chrome!.webview!.postMessage({ id, action, payload });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
