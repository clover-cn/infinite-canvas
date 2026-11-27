import { webview } from '@kit.ArkWeb';

const PREVIEW_ORIGIN = 'https://canvas-preview.invalid/';

const contentTypes: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  wasm: 'application/wasm'
};

@Entry
@Component
struct Workbench {
  private controller: webview.WebviewController = new webview.WebviewController();

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
        response.setResponseMimeType(contentTypes[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream');
        response.setResponseCode(200);
        response.setReasonMessage('OK');
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
    if (!this.controller.accessBackward()) return false;
    this.controller.backward();
    return true;
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
        .onLoadIntercept((event) => !event.data.getRequestUrl().startsWith(PREVIEW_ORIGIN))
        .onInterceptRequest((event) => {
          const url = event.request.getRequestUrl();
          if (url.startsWith('blob:') || url.startsWith('data:')) return null;
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
