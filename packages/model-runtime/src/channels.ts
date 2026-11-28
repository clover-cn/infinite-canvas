import axios from "axios";
import type { ModelListFormat } from "@infinite-canvas/shared/channels";
import { ModelExecutionError } from "@infinite-canvas/shared/model-http";
import { buildModelApiUrl } from "./script.js";

type ModelListTarget = string | { url: string; headers: Record<string, string> };

export async function fetchChannelModels(baseUrl: string, apiKey: string, format: ModelListFormat, resolveTarget: (url: string) => ModelListTarget, signal?: AbortSignal): Promise<string[]> {
    const base = baseUrl.replace(/\/+$/, "");
    const root = /\/v1(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    const endpoint = format === "gemini" ? `${root}/models` : buildModelApiUrl(baseUrl, "/models");
    const target = resolveTarget(endpoint);
    const url = typeof target === "string" ? target : target.url;
    const proxied = typeof target === "string" && url !== endpoint;
    try {
        const response = await axios.get(url, {
            headers: {
                ...(format === "gemini" ? { "x-goog-api-key": apiKey, "Content-Type": "application/json" } : { Authorization: `Bearer ${apiKey}` }),
                ...(typeof target === "string" ? {} : target.headers),
            },
            signal,
        });
        if (response.data.error) throw new axios.AxiosError("Model list failed", undefined, response.config, response.request, response);
        const names = format === "gemini" ? (response.data.models || []).map((item: { name?: string }) => item.name?.replace(/^models\//, "")) : (response.data.data || []).map((item: { id?: string }) => item.id);
        return names.filter((name: string | undefined): name is string => Boolean(name)).sort((a: string, b: string) => a.localeCompare(b));
    } catch (error) {
        signal?.throwIfAborted();
        if (axios.isCancel(error)) throw error;
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            console.warn("[channels] model list request failed", { status, code: error.code });
            if (status === 401 || status === 403 || error.response?.data?.error?.code === "invalid_api_key") throw new ModelExecutionError("MODEL_LIST_AUTH");
            if (status === 429) throw new ModelExecutionError("MODEL_LIST_LIMITED");
            if (!error.response || (typeof target !== "string" && error.response.headers["x-canvas-native-network-error"] === "1")) {
                throw new ModelExecutionError(proxied ? "MODEL_PROXY" : "MODEL_LIST_CONNECTION");
            }
        }
        throw new ModelExecutionError("MODEL_LIST_FAILED");
    }
}
