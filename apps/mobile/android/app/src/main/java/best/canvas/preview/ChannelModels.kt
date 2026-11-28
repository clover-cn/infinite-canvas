package best.canvas.preview

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.FilterInputStream
import java.net.URI
import java.net.URLDecoder
import javax.net.ssl.HttpsURLConnection

private val responseHeaders = mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff")

private fun responseError(status: Int, reason: String, networkError: Boolean = false): WebResourceResponse {
    val headers = if (networkError) responseHeaders + ("X-Canvas-Native-Network-Error" to "1") else responseHeaders
    return WebResourceResponse("application/json", "utf-8", status, reason, headers, "{}".byteInputStream())
}

internal fun loadChannelModels(request: WebResourceRequest): WebResourceResponse {
    if (request.isForMainFrame || request.method != "GET") return responseError(405, "Method Not Allowed")
    val incoming = request.requestHeaders.entries
    val destination = incoming.firstOrNull { it.key.equals("x-canvas-model-endpoint", ignoreCase = true) }?.value
        ?: return responseError(400, "Bad Request")
    val credential = incoming.firstOrNull { it.key.equals("x-goog-api-key", ignoreCase = true) }
        ?: incoming.firstOrNull { it.key.equals("authorization", ignoreCase = true) }
        ?: return responseError(400, "Bad Request")
    val endpoint = try {
        URI(URLDecoder.decode(destination, Charsets.UTF_8.name()))
    } catch (_: Exception) {
        return responseError(400, "Bad Request")
    }
    if (endpoint.scheme != "https" || endpoint.host.isNullOrEmpty() || endpoint.userInfo != null || endpoint.fragment != null ||
        !endpoint.path.endsWith("/models")) return responseError(400, "Bad Request")

    val connection = try {
        (endpoint.toURL().openConnection() as HttpsURLConnection).apply {
            requestMethod = "GET"
            instanceFollowRedirects = false
            useCaches = false
            setRequestProperty("Accept", "application/json")
        }
    } catch (_: Exception) {
        return responseError(502, "Bad Gateway", networkError = true)
    }

    try {
        // 只转发模型列表协议需要的凭据，不接受任意请求头或重定向。
        connection.setRequestProperty(credential.key, credential.value)
        val status = connection.responseCode
        if (status !in 200..299 && status !in 400..599) {
            connection.disconnect()
            return responseError(502, "Bad Gateway")
        }
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val body = if (stream == null) {
            connection.disconnect()
            "{}".byteInputStream()
        } else object : FilterInputStream(stream) {
            override fun close() {
                try {
                    super.close()
                } finally {
                    connection.disconnect()
                }
            }
        }
        return WebResourceResponse("application/json", "utf-8", status, if (status < 300) "OK" else "Upstream Error", responseHeaders, body)
    } catch (_: Exception) {
        connection.disconnect()
        return responseError(502, "Bad Gateway", networkError = true)
    }
}
