import { webview } from '@kit.ArkWeb';
import { NativeHttp } from '../NativeHttp';

const PREVIEW_ORIGIN = 'https://canvas-preview.invalid/';
const NATIVE_HTTP_PATH = PREVIEW_ORIGIN + '_native/http/';

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
