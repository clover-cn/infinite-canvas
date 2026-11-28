import { url } from '@kit.ArkTS';
import { rcp } from '@kit.RemoteCommunicationKit';

function setResponse(response: WebResourceResponse, status: number, reason: string, body: string | ArrayBuffer, networkError: boolean = false): void {
  const headers: Header[] = [
    { headerKey: 'Cache-Control', headerValue: 'no-store' },
    { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' }
  ];
  if (networkError) headers.push({ headerKey: 'X-Canvas-Native-Network-Error', headerValue: '1' });
  response.setResponseMimeType('application/json');
  response.setResponseEncoding('utf-8');
  response.setResponseHeader(headers);
  response.setResponseCode(status);
  response.setReasonMessage(reason);
  response.setResponseData(body);
}

async function requestModels(request: WebResourceRequest, response: WebResourceResponse): Promise<void> {
  try {
    if (request.isMainFrame() || request.getRequestMethod() !== 'GET') {
      setResponse(response, 405, 'Method Not Allowed', '{}');
      return;
    }
    const incoming = request.getRequestHeader();
    const destination = incoming.find((header: Header) => header.headerKey.toLowerCase() === 'x-canvas-model-endpoint')?.headerValue;
    const bearer = incoming.find((header: Header) => header.headerKey.toLowerCase() === 'authorization')?.headerValue;
    const gemini = incoming.find((header: Header) => header.headerKey.toLowerCase() === 'x-goog-api-key')?.headerValue;
    let endpoint: url.URL;
    try {
      endpoint = url.URL.parseURL(decodeURIComponent(destination ?? ''));
    } catch {
      setResponse(response, 400, 'Bad Request', '{}');
      return;
    }
    if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.hash ||
      !endpoint.pathname.endsWith('/models') || (!bearer && !gemini)) {
      setResponse(response, 400, 'Bad Request', '{}');
      return;
    }

    // 只转发模型列表协议需要的凭据，不接受任意请求头或重定向。
    const headers: rcp.RequestHeaders = gemini ?
      { 'accept': 'application/json', 'x-goog-api-key': gemini } :
      { 'accept': 'application/json', 'authorization': bearer };
    const session = rcp.createSession({ requestConfiguration: { transfer: { autoRedirect: false } } });
    try {
      const result = await session.fetch(new rcp.Request(endpoint.href, 'GET', headers));
      const status = result.statusCode;
      if ((status >= 200 && status < 300) || (status >= 400 && status < 600)) {
        setResponse(response, status, status < 300 ? 'OK' : 'Upstream Error', result.body ?? '{}');
      } else {
        setResponse(response, 502, 'Bad Gateway', '{}');
      }
    } finally {
      session.close();
    }
  } catch {
    setResponse(response, 502, 'Bad Gateway', '{}', true);
  } finally {
    response.setResponseIsReady(true);
  }
}

export function loadChannelModels(request: WebResourceRequest): WebResourceResponse {
  const response = new WebResourceResponse();
  response.setResponseIsReady(false);
  void requestModels(request, response);
  return response;
}
