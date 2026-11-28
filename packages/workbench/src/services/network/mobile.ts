import type { NetworkAdapter } from "./runtime";
import { modelErrorMessages } from "@infinite-canvas/shared/model-http";

type NativeControl = {
    stage?: (payload: string) => boolean;
    cancel?: (id: string) => void;
    postMessage?: (payload: string) => void;
    onmessage?: (event: MessageEvent<string>) => void;
};

export function createMobileNetwork(): NetworkAdapter {
    const bridge = (window as Window & { CanvasNativeHttp?: NativeControl }).CanvasNativeHttp;
    const pending = new Map<string, (accepted: boolean) => void>();
    if (bridge?.postMessage) {
        bridge.onmessage = ({ data }) => {
            const [id, accepted] = data.split(":");
            pending.get(id)?.(accepted === "ok");
            pending.delete(id);
        };
    }

    function cancel(id: string) {
        pending.get(id)?.(false);
        pending.delete(id);
        try {
            if (bridge?.cancel) bridge.cancel(id);
            else bridge?.postMessage?.(JSON.stringify({ id }));
        } catch {
            // WebView 已关闭时，由原生容器回收尚未完成的请求。
        }
    }

    function stage(id: string, payload: string) {
        if (bridge?.stage) return Promise.resolve(bridge.stage(payload));
        if (bridge?.postMessage) {
            return new Promise<boolean>((resolve, reject) => {
                pending.set(id, resolve);
                try { bridge.postMessage!(payload); }
                catch (error) { pending.delete(id); reject(error); }
            });
        }
        return Promise.reject(new TypeError("原生网络接口不可用，请重新安装移动预览包。"));
    }

    return {
        kind: "mobile",
        url: (url) => url,
        async request(url, init, purpose = "download") {
            if (!/^https?:/i.test(url) || new URL(url).origin === location.origin) return fetch(url, init);
            if (!url.startsWith("https://")) throw new TypeError("移动端网络请求需要使用 HTTPS。");
            if (init?.body != null && typeof init.body !== "string") throw new TypeError(modelErrorMessages.MODEL_MOBILE_REFERENCE_UNAVAILABLE);
            const signal = init?.signal;
            signal?.throwIfAborted();
            const id = crypto.randomUUID();
            const route = "/_native/http/" + id;
            const headers = purpose === "model" ? [...new Headers(init?.headers)] : [];
            const payload = JSON.stringify({ id, url, purpose, method: init?.method ?? "GET", headers, body: init?.body ?? null });
            const abort = () => cancel(id);
            const finish = () => signal?.removeEventListener("abort", abort);
            signal?.addEventListener("abort", abort, { once: true });
            try {
                const accepted = await stage(id, payload);
                signal?.throwIfAborted();
                if (!accepted) throw new TypeError("原生层拒绝了该网络请求。");
                const response = await fetch(route, { cache: "no-store", signal });
                if (response.headers.has("x-canvas-native-network-error")) throw new TypeError("Network Error");
                const chunked = response.headers.has("x-canvas-native-stream");
                if (purpose === "download" && !response.ok) {
                    finish();
                    cancel(id);
                    await response.body?.cancel().catch(() => {});
                    return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
                }
                if ((!response.body && !chunked) || response.status === 204 || response.status === 205) {
                    finish();
                    if (chunked) cancel(id);
                    return response;
                }
                const reader = chunked ? undefined : response.body?.getReader();
                const body = new ReadableStream<Uint8Array>({
                    async pull(controller) {
                        try {
                            if (reader) {
                                const part = await reader.read();
                                if (!part.done) { controller.enqueue(part.value); return; }
                                reader.releaseLock();
                            } else {
                                const part = await fetch(route + "/read", { cache: "no-store", signal });
                                if (!part.ok) throw new TypeError("Network Error");
                                if (part.status !== 204) { controller.enqueue(new Uint8Array(await part.arrayBuffer())); return; }
                            }
                            finish();
                            controller.close();
                        } catch (error) {
                            finish();
                            cancel(id);
                            controller.error(error);
                        }
                    },
                    async cancel() {
                        finish();
                        cancel(id);
                        await reader?.cancel();
                    },
                });
                return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
            } catch (error) {
                finish();
                cancel(id);
                throw error;
            }
        },
    };
}
