import { ProxyAgent, setGlobalDispatcher } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

function readEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

export function getProxyUrlFor(targetUrl) {
  const u = String(targetUrl || "");
  const isHttps = u.startsWith("https://") || u.startsWith("wss://");
  const isHttp = u.startsWith("http://") || u.startsWith("ws://");

  const all = readEnv("ALL_PROXY") || readEnv("all_proxy");
  const https = readEnv("HTTPS_PROXY") || readEnv("https_proxy");
  const http = readEnv("HTTP_PROXY") || readEnv("http_proxy");

  if (isHttps) return https || all || "";
  if (isHttp) return http || all || "";
  return all || https || http || "";
}

export function applyGlobalProxyFromEnv() {
  const proxyUrl = getProxyUrlFor("https://example.com");
  if (!proxyUrl) return false;

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    return true;
  } catch {
    return false;
  }
}

export function wsAgentForUrl(wsUrl) {
  const proxyUrl = getProxyUrlFor(wsUrl);
  if (!proxyUrl) return undefined;

  const lower = proxyUrl.toLowerCase();
  if (lower.startsWith("socks://") || lower.startsWith("socks5://") || lower.startsWith("socks4://")) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}
