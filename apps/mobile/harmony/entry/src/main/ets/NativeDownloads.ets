import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { fileIo, picker } from '@kit.CoreFileKit';

interface Download {
  item: webview.WebDownloadItem;
  path: string;
  name: string;
}

export class NativeDownloads {
  private delegate: webview.WebDownloadDelegate = new webview.WebDownloadDelegate();
  private pending: Map<string, Download> = new Map<string, Download>();
  private saving: Promise<void> = Promise.resolve();
  private closed: boolean = false;
  private context: common.UIAbilityContext;
  private notify: (message: string) => void;

  constructor(context: common.UIAbilityContext, notify: (message: string) => void) {
    this.context = context;
    this.notify = notify;
  }

  attach(controller: webview.WebviewController, origin: string): void {
    this.delegate.onBeforeDownload((item: webview.WebDownloadItem) => {
      const id = item.getGuid();
      if (this.closed || !item.getUrl().startsWith('blob:' + origin) || !/^[a-fA-F0-9-]+$/.test(id)) {
        this.cancel(item);
        return;
      }
      const name = item.getSuggestedFileName().replace(/[\\/:*?"<>|]/g, '_').trim() || '下载文件';
      const path = this.context.cacheDir + '/canvas-download-' + id;
      this.pending.set(id, { item, path, name });
      try {
        // 先让 ArkWeb 直接写入应用缓存，再由系统选择器授权要保存的位置。
        item.start(path);
      } catch (error) {
        this.pending.delete(id);
        this.cancel(item);
        void this.remove(path);
        console.error('启动下载失败', error);
        this.notify('下载失败，请重试');
      }
    });
    this.delegate.onDownloadFinish((item: webview.WebDownloadItem) => {
      const id = item.getGuid();
      const download = this.pending.get(id);
      if (!download) return;
      this.pending.delete(id);
      this.saving = this.saving.then(() => this.save(download));
    });
    this.delegate.onDownloadFailed((item: webview.WebDownloadItem) => {
      const id = item.getGuid();
      const download = this.pending.get(id);
      if (!download) return;
      this.pending.delete(id);
      void this.remove(download.path);
      console.error('ArkWeb 下载失败，错误码 ' + item.getLastErrorCode());
      if (!this.closed) this.notify('下载失败，请重试');
    });
    controller.setDownloadDelegate(this.delegate);
  }

  close(): void {
    this.closed = true;
    for (const download of this.pending.values()) {
      this.cancel(download.item);
      void this.remove(download.path);
    }
    this.pending.clear();
  }

  private cancel(item: webview.WebDownloadItem): void {
    try { item.cancel(); } catch {
      // 下载可能已结束。
    }
  }

  private async save(download: Download): Promise<void> {
    try {
      if (this.closed) return;
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [download.name];
      const destinations = await new picker.DocumentViewPicker(this.context).save(options);
      if (!destinations[0]) return;
      const file = await fileIo.open(destinations[0], fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try {
        await fileIo.copyFile(download.path, file.fd);
      } finally {
        await fileIo.close(file);
      }
      if (!this.closed) this.notify('文件已保存');
    } catch (error) {
      console.error('保存下载文件失败', error);
      if (!this.closed) this.notify('保存失败，请重试');
    } finally {
      await this.remove(download.path);
    }
  }

  private async remove(path: string): Promise<void> {
    try { await fileIo.unlink(path); } catch {
      // ArkWeb 可能已经清理临时文件。
    }
  }
}
