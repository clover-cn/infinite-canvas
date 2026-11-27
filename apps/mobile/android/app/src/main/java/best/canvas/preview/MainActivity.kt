package best.canvas.preview

import android.app.Activity
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
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    private lateinit var workbench: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val title = TextView(this).apply {
            text = "移动端预览 · 请使用测试作品"
            setTextColor(Color.WHITE)
            setPadding(16, 12, 16, 12)
        }
        workbench = WebView(this)
        val assets = WebViewAssetLoader.Builder()
            .setDomain(PREVIEW_HOST)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        workbench.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }
        workbench.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.scheme != "https" || request.url.host != PREVIEW_HOST

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val scheme = request.url.scheme
                if (scheme == "blob" || scheme == "data") return null
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
        (workbench.parent as? LinearLayout)?.removeView(workbench)
        workbench.destroy()
        super.onDestroy()
    }

    private companion object {
        const val PREVIEW_HOST = "canvas-preview.invalid"
    }
}
