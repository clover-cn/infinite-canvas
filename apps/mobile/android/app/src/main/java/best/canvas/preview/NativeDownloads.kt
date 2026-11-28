package best.canvas.preview

import android.content.ContentResolver
import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import java.io.OutputStream
import java.util.concurrent.Executors
import org.json.JSONObject

internal class NativeDownloads(private val resolver: ContentResolver, private val binarySupported: Boolean) {
    private data class Download(val id: String, val uri: Uri, val output: OutputStream, var remaining: Long)

    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var current: Download? = null

    fun receive(message: WebMessageCompat, reply: JavaScriptReplyProxy) {
        if (worker.isShutdown) return
        worker.execute {
            var id = current?.id
            val result = try {
                if (binarySupported && message.type == WebMessageCompat.TYPE_ARRAY_BUFFER) {
                    val download = current ?: return@execute
                    val bytes = message.arrayBuffer
                    check(bytes.size <= download.remaining)
                    download.output.write(bytes)
                    download.remaining -= bytes.size
                    "ok"
                } else {
                    val control = JSONObject(message.data ?: return@execute)
                    val requestId = control.getString("id")
                    id = requestId
                    when (control.getString("action")) {
                        "start" -> when {
                            !binarySupported -> "unsupported"
                            current != null -> "error"
                            else -> { current = start(requestId, control); "ok" }
                        }
                        "finish" -> {
                            val download = checkNotNull(current?.takeIf { it.id == requestId })
                            finish(download)
                            "ok"
                        }
                        "cancel" -> {
                            if (current?.id == requestId) discard()
                            return@execute
                        }
                        else -> "error"
                    }
                }
            } catch (error: Exception) {
                Log.e("CanvasDownloads", "保存下载文件失败", error)
                if (current?.id == id) discard()
                "error"
            }
            if (id != null) main.post {
                try { reply.postMessage("$id:$result") } catch (_: RuntimeException) {
                    // 页面可能已退出。
                }
            }
        }
    }

    private fun start(id: String, control: JSONObject): Download {
        val name = control.getString("name").replace(Regex("""[\\/:*?"<>|\p{Cntrl}]"""), "_").trim()
        val mime = control.optString("type").substringBefore(';').ifBlank { "application/octet-stream" }
        val size = control.getLong("size")
        require(name.isNotBlank() && size >= 0)
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/无限画布")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = checkNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        try {
            return Download(id, uri, checkNotNull(resolver.openOutputStream(uri)), size)
        } catch (error: Exception) {
            remove(uri)
            throw error
        }
    }

    private fun finish(download: Download) {
        check(download.remaining == 0L)
        download.output.close()
        // 整个文件写完后才让系统文件管理器看到它。
        val values = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
        check(resolver.update(download.uri, values, null, null) == 1)
        current = null
    }

    private fun remove(uri: Uri) {
        try { resolver.delete(uri, null, null) } catch (error: Exception) {
            Log.w("CanvasDownloads", "清理未完成的下载失败", error)
        }
    }

    private fun discard() {
        val download = current ?: return
        current = null
        try { download.output.close() } catch (_: Exception) {
            // 继续清理未完成的下载记录。
        }
        remove(download.uri)
    }

    fun cancelActive() {
        if (!worker.isShutdown) worker.execute(::discard)
    }

    fun close() {
        cancelActive()
        worker.shutdown()
    }
}
