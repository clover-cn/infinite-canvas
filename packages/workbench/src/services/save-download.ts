import { saveAs } from "file-saver";
import { network } from "./network/runtime";

type DownloadBridge = {
    postMessage(data: string | ArrayBuffer): void;
    onmessage: ((event: MessageEvent<string>) => void) | null;
};

const chunkSize = 256 * 1024;
let saving: Promise<unknown> = Promise.resolve();

/** Android 预览将 WebView 素材逐块保存到下载目录。其他入口沿用浏览器下载。 */
export async function saveDownload(blob: Blob, name: string, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted();
    const bridge = network.kind === "mobile" ? (window as Window & { CanvasNativeDownload?: DownloadBridge }).CanvasNativeDownload : undefined;
    if (!bridge) {
        saveAs(blob, name);
        return false;
    }

    const task = saving.then(async () => {
        signal.throwIfAborted();
        const id = crypto.randomUUID();
        const control = (action: "start" | "finish" | "cancel") => JSON.stringify({ id, action, name, type: blob.type, size: blob.size });
        const send = (message: string | ArrayBuffer) => new Promise<void>((resolve, reject) => {
            signal.throwIfAborted();
            const clear = () => {
                bridge.onmessage = null;
                signal.removeEventListener("abort", abort);
            };
            const abort = () => { clear(); reject(signal.reason); };
            bridge.onmessage = ({ data }) => {
                const [downloadId, result] = data.split(":");
                if (downloadId !== id) return;
                clear();
                if (result === "ok") resolve();
                else reject(new Error(result === "unsupported" ? "当前 Android WebView 不支持保存文件，请更新后重试。" : "保存文件失败，请重试。"));
            };
            signal.addEventListener("abort", abort, { once: true });
            try { bridge.postMessage(message); }
            catch (error) { clear(); reject(error); }
        });

        try {
            await send(control("start"));
            // 等原生层写完当前块再读下一块，避免把整个文件装进一条桥接消息。
            for (let offset = 0; offset < blob.size; offset += chunkSize) {
                signal.throwIfAborted();
                await send(await blob.slice(offset, offset + chunkSize).arrayBuffer());
            }
            await send(control("finish"));
            return true;
        } catch (error) {
            try { bridge.postMessage(control("cancel")); } catch {
                // 页面退出时，原生容器也会回收未完成的下载。
            }
            throw error;
        }
    });
    saving = task.catch(() => {});
    return task;
}
