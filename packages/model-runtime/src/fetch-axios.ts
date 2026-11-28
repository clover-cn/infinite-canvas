import axios, { type AxiosAdapter } from "axios";

/** 保留现有 Axios 的请求序列化、响应解析和错误协议。 */
export function createFetchAxiosAdapter(send: (url: string, init: RequestInit) => Promise<Response>): AxiosAdapter {
    return async (config) => {
        const headers = new Headers(Object.entries(config.headers.toJSON(true)).map(([name, value]) => [name, String(value)]));
        let response: Response;
        try {
            response = await send(axios.getUri(config), {
                method: config.method?.toUpperCase(),
                headers,
                body: config.data,
                signal: config.signal as AbortSignal | undefined,
            });
        } catch (error) {
            if (config.signal?.aborted) throw new axios.CanceledError(undefined, config);
            throw new axios.AxiosError(error instanceof Error ? error.message : "Network Error", "ERR_NETWORK", config);
        }
        const result = {
            data: config.responseType === "arraybuffer" ? await response.arrayBuffer() : await response.text(),
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            config,
        };
        if (config.validateStatus && !config.validateStatus(response.status)) {
            throw new axios.AxiosError(`Request failed with status code ${response.status}`, response.status < 500 ? "ERR_BAD_REQUEST" : "ERR_BAD_RESPONSE", config, undefined, result);
        }
        return result;
    };
}
