package best.canvas.preview

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var workbench: WebView
    private lateinit var downloads: NativeDownloads
    private val nativeHttp = NativeHttp()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val title = TextView(this).apply {
            text = "移动端预览 · 请使用测试作品"
            setTextColor(Color.WHITE)
            setPadding(16, 12, 16, 12)
        }
        workbench = WebView(this)
        downloads = NativeDownloads(contentResolver, WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER))
        val assets = WebViewAssetLoader.Builder()
            .setDomain(PREVIEW_HOST)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            val appAssets = applicationContext.assets
            // 注册脚本的请求可能绕过 WebViewClient，直接从安装包返回脚本。
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                    if (request.method != "GET" || request.url.toString() != "https://$PREVIEW_HOST/plugin-files-sw.js") return null
                    return try {
                        WebResourceResponse("text/javascript", "utf-8", 200, "OK",
                            mapOf("Cache-Control" to "no-store"), appAssets.open("plugin-files-sw.js"))
                    } catch (_: IOException) {
                        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
                    }
                }
            })
        }
        workbench.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(workbench, "CanvasNativeDownload", setOf("https://$PREVIEW_HOST")) { _, message, _, isMainFrame, reply ->
                if (isMainFrame) downloads.receive(message, reply)
            }
            WebViewCompat.addWebMessageListener(workbench, "CanvasNativeHttp", setOf("https://$PREVIEW_HOST")) { _, message, _, isMainFrame, reply ->
                val payload = message.data
                if (isMainFrame && payload != null) {
                    val result = nativeHttp.control(payload)
                    if (result.isNotEmpty()) reply.postMessage(result)
                }
            }
        }
        workbench.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                nativeHttp.close()
                downloads.cancelActive()
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.scheme != "https" || request.url.host != PREVIEW_HOST

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val scheme = request.url.scheme
                if (scheme == "blob" || scheme == "data") return null
                val nativePath = "https://$PREVIEW_HOST/_native/http/"
                val url = request.url.toString()
                if (url.startsWith(nativePath)) return nativeHttp.load(request, url.removePrefix(nativePath))
                return assets.shouldInterceptRequest(request.url)
                    ?: WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), "资源未找到".byteInputStream())
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            if (Build.VERSION.SDK_INT >= 35) {
                setOnApplyWindowInsetsListener { view, insets ->
                    val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                    view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
                    insets
                }
            }
            addView(title)
            addView(workbench, LinearLayout.LayoutParams(-1, 0, 1f))
        })
        if (savedInstanceState == null || workbench.restoreState(savedInstanceState) == null) {
            workbench.loadUrl("https://$PREVIEW_HOST/index.html")
        }
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, ::goBackOrFinish)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        workbench.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("预览应用通过此回调处理网页历史")
    override fun onBackPressed() {
        goBackOrFinish()
    }

    private fun goBackOrFinish() {
        if (workbench.canGoBack()) workbench.goBack() else finish()
    }

    override fun onDestroy() {
        nativeHttp.close()
        downloads.close()
        (workbench.parent as? LinearLayout)?.removeView(workbench)
        workbench.destroy()
        super.onDestroy()
    }

    private companion object {
        const val PREVIEW_HOST = "canvas-preview.invalid"
    }
}
