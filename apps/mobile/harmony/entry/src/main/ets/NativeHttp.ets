import { deviceInfo } from '@kit.BasicServicesKit';
import { url } from '@kit.ArkTS';
import { rcp } from '@kit.RemoteCommunicationKit';

const modelHeaders: string[] = [
  'accept', 'content-type', 'authorization', 'api-key', 'x-api-key', 'x-goog-api-key',
  'anthropic-version', 'anthropic-beta', 'anthropic-dangerous-direct-browser-access', 'x-dashscope-async'
];

interface RequestDescriptor {
  id: string;
  url: string;
  purpose: string;
  method: string;
  headers: string[][];
  body: string | null;
}

function respond(response: WebResourceResponse, status: number, body: string | ArrayBuffer,
  contentType: string = 'application/octet-stream', marker: string = ''): void {
  const headers: Header[] = [
    { headerKey: 'Cache-Control', headerValue: 'no-store' },
    { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' }
  ];
  if (marker) headers.push({ headerKey: marker, headerValue: '1' });
  const supported = (status >= 200 && status < 300) || (status >= 400 && status < 600);
  response.setResponseHeader(headers);
  response.setResponseMimeType(contentType.split(';')[0]);
  response.setResponseEncoding('utf-8');
  response.setResponseCode(supported ? status : 502);
  response.setReasonMessage(supported && status < 300 ? 'OK' : 'Request Failed');
  response.setResponseData(supported ? body : '');
  response.setResponseIsReady(true);
}

class RequestTicket {
  private status: number = 0;
  private contentType: string | undefined = undefined;
  private head: WebResourceResponse | undefined = undefined;
  private waiting: WebResourceResponse | undefined = undefined;
  private chunk: ArrayBuffer | undefined = undefined;
  private acknowledge: (() => void) | undefined = undefined;
  private session: rcp.Session | undefined = undefined;
  private finished: boolean = false;
  private failed: boolean = false;
  private cancelled: boolean = false;
  private request: RequestDescriptor;
  private remove: () => void;

  private started: boolean = false;

  constructor(request: RequestDescriptor, remove: () => void) {
    this.request = request;
    this.remove = remove;
  }

  reply(response: WebResourceResponse): void {
    if (this.started) {
      respond(response, 404, '');
      return;
    }
    this.started = true;
    this.head = response;
    void this.run();
  }

  next(response: WebResourceResponse): void {
    if (!this.started || this.waiting || this.head) {
      respond(response, 409, '');
      return;
    }
    if (this.chunk) {
      const data = this.chunk;
      const acknowledge = this.acknowledge;
      this.chunk = undefined;
      this.acknowledge = undefined;
      respond(response, 200, data);
      acknowledge?.();
    } else if (this.finished) {
      respond(response, this.failed ? 502 : 204, '');
      this.remove();
    } else {
      this.waiting = response;
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.end(true);
    this.session?.cancel();
  }

  private sendHead(): void {
    if (!this.head || this.status < 200 || this.contentType === undefined) return;
    const head = this.head;
    this.head = undefined;
    respond(head, this.status, '', this.contentType, 'x-canvas-native-stream');
  }

  private receive(data: ArrayBuffer): void | Promise<void> {
    if (this.cancelled) return;
    if (this.waiting) {
      const waiting = this.waiting;
      this.waiting = undefined;
      respond(waiting, 200, data);
      return;
    }
    // WebView 取走上一块数据后才让 RCP 继续读取。
    return new Promise<void>((resolve) => {
      this.chunk = data;
      this.acknowledge = () => resolve();
    });
  }

  private end(failed: boolean): void {
    this.finished = true;
    this.failed = failed;
    if (this.head) {
      respond(this.head, 502, '', 'text/plain', 'x-canvas-native-network-error');
      this.head = undefined;
      this.remove();
    }
    if (this.waiting) {
      respond(this.waiting, failed ? 502 : 204, '');
      this.waiting = undefined;
      this.remove();
    }
    if (failed) {
      this.chunk = undefined;
      const acknowledge = this.acknowledge;
      this.acknowledge = undefined;
      acknowledge?.();
    }
  }

  private async run(): Promise<void> {
    try {
      const headers: rcp.RequestHeaders = { 'accept': '*/*' };
      for (const field of this.request.headers) {
        if (modelHeaders.includes(field[0])) headers[field[0]] = field[1];
      }
      const method: rcp.HttpMethod = this.request.method === 'POST' ? 'POST' : 'GET';
      const configuration: rcp.Configuration = { transfer: { autoRedirect: false } };
      // RCP 从 API 20 起提供独立的响应状态回调，低版本使用完整响应。
      if (deviceInfo.sdkApiVersion >= 20) {
        configuration.tracing = {
          httpEventsHandler: {
            onStatusCodeReceive: (status: number) => {
              this.status = status;
              this.sendHead();
            },
            onHeaderReceive: (headers: rcp.ResponseHeaders) => {
              this.contentType = headers['content-type'] ?? 'application/octet-stream';
              this.sendHead();
            },
            onDataReceive: (data: ArrayBuffer) => this.receive(data)
          }
        };
      }
      const session = rcp.createSession({ requestConfiguration: configuration });
      this.session = session;
      try {
        const result = await session.fetch(new rcp.Request(this.request.url, method, headers, this.request.body ?? undefined));
        if (this.head) {
          respond(this.head, result.statusCode, result.body ?? '', result.headers['content-type']);
          this.head = undefined;
          this.remove();
        }
        this.end(false);
      } finally {
        this.session = undefined;
        session.close();
      }
    } catch {
      this.end(true);
    }
  }
}

export class NativeHttp {
  private tickets: Map<string, RequestTicket> = new Map<string, RequestTicket>();

  stage(payload: string): boolean {
    try {
      const request = JSON.parse(payload) as RequestDescriptor;
      const endpoint = url.URL.parseURL(request.url);
      if (!/^[0-9a-f-]{36}$/.test(request.id) || this.tickets.has(request.id) || endpoint.protocol !== 'https:' ||
        !endpoint.hostname || endpoint.username || endpoint.password || endpoint.hash ||
        !Array.isArray(request.headers) || (request.body !== null && (request.method !== 'POST' || typeof request.body !== 'string'))) return false;
      const supported = request.purpose === 'model' && (request.method === 'GET' || request.method === 'POST') ||
        request.purpose === 'download' && request.method === 'GET' && request.headers.length === 0;
      if (!supported) return false;
      this.tickets.set(request.id, new RequestTicket(request, () => { this.tickets.delete(request.id); }));
      return true;
    } catch {
      return false;
    }
  }

  cancel(id: string): void {
    const ticket = this.tickets.get(id);
    this.tickets.delete(id);
    try { ticket?.cancel(); } catch {
      // 页面可能已关闭，丢弃原生请求在关闭后的回调。
    }
  }

  close(): void {
    for (const id of this.tickets.keys()) this.cancel(id);
  }

  load(request: WebResourceRequest, path: string): WebResourceResponse {
    const response = new WebResourceResponse();
    if (request.isMainFrame() || request.getRequestMethod() !== 'GET') {
      respond(response, 405, '');
      return response;
    }
    const parts = path.split('/');
    const ticket = this.tickets.get(parts[0]);
    if (!ticket || (parts.length !== 1 && (parts.length !== 2 || parts[1] !== 'read'))) {
      respond(response, 404, '');
      return response;
    }
    response.setResponseIsReady(false);
    if (parts.length === 1) ticket.reply(response);
    else ticket.next(response);
    return response;
  }
}
