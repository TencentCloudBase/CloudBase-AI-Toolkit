import { HttpsProxyAgent } from "https-proxy-agent";
import _fetch from "node-fetch";
import { URL } from "url";
import { CloudBaseError } from "../error";

// 使用 fetch + 代理
export async function fetch(
  url: string,
  config: Record<string, any> = {},
  proxy: any = null,
) {
  if (proxy || process.env.http_proxy) {
    config.agent = new HttpsProxyAgent(proxy || process.env.http_proxy);
  }
  // 解决中文编码问题
  const escapeUrl = new URL(url).toString();
  let json;
  let text;
  try {
    const res = await _fetch(escapeUrl, config);
    text = await res.text();
    json = JSON.parse(text);
  } catch (e) {
    // 某些情况下回返回 HTML 文本异常
    // JSON 解析错误，抛出原响应文本
    if (e.name === "SyntaxError") {
      throw new CloudBaseError(text);
    }
    throw new CloudBaseError(e);
  }
  return json;
}

export async function fetchStream(
  url: string,
  config: Record<string, any> = {},
  proxy: any = null,
) {
  if (proxy || process.env.http_proxy) {
    config.agent = new HttpsProxyAgent(proxy || process.env.http_proxy);
  }
  // 解决中文编码问题
  const escapeUrl = new URL(url).toString();
  return _fetch(escapeUrl, config);
}
