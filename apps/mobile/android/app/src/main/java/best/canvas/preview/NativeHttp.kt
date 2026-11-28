package best.canvas.preview

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.FilterInputStream
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import org.json.JSONObject

private val responseHeaders = mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff")
private val modelHeaders = setOf("accept", "content-type", "authorization", "api-key", "x-api-key", "x-goog-api-key",
    "anthropic-version", "anthropic-beta", "anthropic-dangerous-direct-browser-access", "x-dashscope-async")

private fun responseError(status: Int, reason: String, networkError: Boolean = false): WebResourceResponse {
    val headers = if (networkError) responseHeaders + ("X-Canvas-Native-Network-Error" to "1") else responseHeaders
    return WebResourceResponse("application/json", "utf-8", status, reason, headers, "{}".byteInputStream())
}

internal class NativeHttp {
    private class Ticket(val endpoint: URI, val method: String, val headers: Map<String, String>, val body: String?) {
        val started = AtomicBoolean(false)
        @Volatile var connection: HttpsURLConnection? = null
    }

    private val tickets = ConcurrentHashMap<String, Ticket>()

    fun control(payload: String): String {
        val message = try { JSONObject(payload) } catch (_: Exception) { return "" }
        val id = message.optString("id")
        if (!id.matches(Regex("[0-9a-f-]{36}"))) return ""
        if (!message.has("url")) {
            cancel(id)
            return ""
        }
        val accepted = try {
            val endpoint = URI(message.getString("url"))
            val purpose = message.getString("purpose")
            val method = message.getString("method")
            val body = if (message.isNull("body")) null else message.get("body") as String
            val headers = message.getJSONArray("headers")
            val supported = endpoint.scheme == "https" && !endpoint.host.isNullOrEmpty() && endpoint.userInfo == null &&
                endpoint.fragment == null && (purpose == "model" && (method == "GET" || method == "POST") ||
                purpose == "download" && method == "GET" && headers.length() == 0) && (method == "POST" || body == null)
            if (!supported) false else {
                val acceptedHeaders = mutableMapOf<String, String>()
                for (index in 0 until headers.length()) {
                    val field = headers.getJSONArray(index)
                    val name = field.getString(0)
                    if (name in modelHeaders) acceptedHeaders[name] = field.getString(1)
                }
                tickets.putIfAbsent(id, Ticket(endpoint, method, acceptedHeaders, body)) == null
            }
        } catch (_: Exception) { false }
        return "$id:${if (accepted) "ok" else "rejected"}"
    }

    private fun cancel(id: String) {
        tickets.remove(id)?.connection?.disconnect()
    }

    fun close() = tickets.keys.forEach(::cancel)

    fun load(request: WebResourceRequest, id: String): WebResourceResponse {
        if (request.isForMainFrame || request.method != "GET") return responseError(405, "Method Not Allowed")
        val ticket = tickets[id] ?: return responseError(404, "Not Found")
        if (!ticket.started.compareAndSet(false, true)) return responseError(404, "Not Found")

        try {
            val connection = ticket.endpoint.toURL().openConnection() as HttpsURLConnection
            ticket.connection = connection
            if (tickets[id] !== ticket) {
                connection.disconnect()
                return responseError(404, "Not Found")
            }
            connection.requestMethod = ticket.method
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            ticket.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
            ticket.body?.let { text ->
                val bytes = text.toByteArray(Charsets.UTF_8)
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            if (status !in 200..299 && status !in 400..599) {
                cancel(id)
                return responseError(502, "Bad Gateway")
            }
            val contentType = connection.contentType ?: "application/octet-stream"
            val mimeType = contentType.substringBefore(';')
            val encoding = contentType.substringAfter("charset=", "").takeIf { it.isNotEmpty() }
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = if (stream == null || status == 204 || status == 205) {
                cancel(id)
                null
            } else object : FilterInputStream(stream) {
                override fun close() {
                    try {
                        super.close()
                    } finally {
                        cancel(id)
                    }
                }
            }
            return WebResourceResponse(mimeType, encoding, status, if (status < 300) "OK" else "Upstream Error", responseHeaders, body)
        } catch (_: Exception) {
            cancel(id)
            return responseError(502, "Bad Gateway", networkError = true)
        }
    }
}
