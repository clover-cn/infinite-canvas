import { common } from '@kit.AbilityKit';
import { webview, WebNetErrorList } from '@kit.ArkWeb';
import { NativeHttp } from '../NativeHttp';
import { NativeDownloads } from '../NativeDownloads';

const PREVIEW_ORIGIN = 'https://canvas-preview.invalid/';
const NATIVE_HTTP_PATH = PREVIEW_ORIGIN + '_native/http/';
const PLUGIN_WORKER_FILE = 'plugin-files-sw.js';

const contentTypes = new Map<string, string>()
  .set('html', 'text/html')
  .set('js', 'text/javascript')
  .set('css', 'text/css')
  .set('json', 'application/json')
  .set('svg', 'image/svg+xml')
  .set('png', 'image/png')
  .set('jpeg', 'image/jpeg')
  .set('jpg', 'image/jpeg')
  .set('webp', 'image/webp')
  .set('ico', 'image/x-icon')
  .set('woff2', 'font/woff2')
  .set('wasm', 'application/wasm');

@Entry
@Component
struct Workbench {
  private controller: webview.WebviewController = new webview.WebviewController();
  private nativeHttp: NativeHttp = new NativeHttp();
  private downloads: NativeDownloads | undefined = undefined;
  private pluginWorkerHandler: webview.WebSchemeHandler | undefined = undefined;

  private attachDownloads(): void {
    const ui = this.getUIContext();
    const context = ui.getHostContext() as common.UIAbilityContext | undefined;
    if (!context || this.downloads) return;
    try {
      const downloads = new NativeDownloads(context, (message: string) => {
        try { ui.getPromptAction().showToast({ message }); } catch {
          // 页面关闭后无需再显示提示。
        }
      });
      downloads.attach(this.controller, PREVIEW_ORIGIN);
      this.downloads = downloads;
    } catch (error) {
      console.error('注册下载处理器失败', error);
    }
  }

  private attachPluginWorker(): void {
    const manager = this.getUIContext().getHostContext()?.resourceManager;
    if (!manager || this.pluginWorkerHandler) return;
    try {
      const scheme = new webview.WebSchemeHandler();
      scheme.onRequestStart((request: webview.WebSchemeHandlerRequest, handler: webview.WebResourceHandler): boolean => {
        if (request.getRequestUrl() !== PREVIEW_ORIGIN + PLUGIN_WORKER_FILE || request.getRequestMethod() !== 'GET') return false;
        let bytes: Uint8Array | undefined;
        try {
          bytes = manager.getRawFileContentSync('workbench/' + PLUGIN_WORKER_FILE);
        } catch (error) {
          console.error('读取包内插件加载脚本失败', error);
        }
        try {
          const response = new webview.WebSchemeHandlerResponse();
          response.setNetErrorCode(WebNetErrorList.NET_OK);
          response.setStatus(bytes ? 200 : 404);
          response.setStatusText(bytes ? 'OK' : 'Not Found');
          response.setMimeType('text/javascript');
          response.setHeaderByName('Content-Type', 'text/javascript', false);
          response.setHeaderByName('Cache-Control', 'no-store', false);
          handler.didReceiveResponse(response);
          if (bytes) handler.didReceiveResponseBody(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          handler.didFinish();
        } catch (error) {
          console.error('返回包内插件加载脚本失败', error);
        }
        return true;
      });
      // 页面和 Service Worker 的请求可能走不同的拦截入口，两处都提供同一个包内脚本。
      webview.WebviewController.setServiceWorkerWebSchemeHandler('https', scheme);
      this.pluginWorkerHandler = scheme;
      this.controller.setWebSchemeHandler('https', scheme);
    } catch (error) {
      console.error('注册包内插件加载脚本入口失败', error);
    }
  }

  private loadAsset(requestUrl: string): WebResourceResponse {
    const response = new WebResourceResponse();
    response.setResponseEncoding('utf-8');
    try {
      const path = requestUrl.startsWith(PREVIEW_ORIGIN) ?
        decodeURIComponent(requestUrl.slice(PREVIEW_ORIGIN.length).split(/[?#]/)[0]) : '';
      const manager = this.getUIContext().getHostContext()?.resourceManager;
      if (manager && /^[a-zA-Z0-9_./-]+$/.test(path) && path.split('/').every((part: string) => part !== '' && part !== '.' && part !== '..')) {
        const bytes = manager.getRawFileContentSync('workbench/' + path);
        response.setResponseData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        response.setResponseMimeType(contentTypes.get(path.slice(path.lastIndexOf('.') + 1)) ?? 'application/octet-stream');
        response.setResponseCode(200);
        response.setReasonMessage('OK');
        if (path === 'index.html') {
          const headers: Header[] = [
            { headerKey: 'Content-Security-Policy', headerValue: "frame-src 'none'; object-src 'none'; base-uri 'none'" }
          ];
          response.setResponseHeader(headers);
        }
        return response;
      }
    } catch {
      // 缺失和不合法的资源都交给本地错误响应处理。
    }
    response.setResponseData('资源未找到');
    response.setResponseMimeType('text/plain');
    response.setResponseCode(404);
    response.setReasonMessage('Not Found');
    return response;
  }

  onBackPress(): boolean {
    try {
      if (!this.controller.accessBackward()) return false;
      this.controller.backward();
      return true;
    } catch (error) {
      console.error('工作台网页返回失败', error);
      return false;
    }
  }

  aboutToDisappear(): void {
    this.nativeHttp.close();
    this.downloads?.close();
    this.downloads = undefined;
    if (this.pluginWorkerHandler) {
      webview.WebviewController.clearServiceWorkerWebSchemeHandler();
      this.pluginWorkerHandler = undefined;
    }
    try { this.controller.deleteJavaScriptRegister('CanvasNativeHttp'); } catch {
      // Web 组件可能已释放。
    }
  }

  build() {
    Column() {
      Text('移动端预览 · 请使用测试作品')
        .fontSize(14)
        .fontColor(Color.White)
        .padding(12)
        .width('100%')
      Web({ src: PREVIEW_ORIGIN + 'index.html', controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .javaScriptProxy({
          object: this.nativeHttp,
          name: 'CanvasNativeHttp',
          methodList: ['stage', 'cancel'],
          controller: this.controller
        })
        .onControllerAttached(() => {
          this.attachPluginWorker();
          this.attachDownloads();
        })
        .onPageBegin(() => this.nativeHttp.close())
        .onLoadIntercept((event) => !event.data.getRequestUrl().startsWith(PREVIEW_ORIGIN))
        .onInterceptRequest((event) => {
          const url = event.request.getRequestUrl();
          if (url.startsWith('blob:') || url.startsWith('data:')) return null;
          if (url.startsWith(NATIVE_HTTP_PATH)) return this.nativeHttp.load(event.request, url.slice(NATIVE_HTTP_PATH.length));
          return this.loadAsset(url);
        })
        .width('100%')
        .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.launch_background'))
  }
}
