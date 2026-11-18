import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const PROXY_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];

/** Child processes do not automatically use the macOS HTTP proxy preferences. */
export async function systemProxyEnvironment(environment: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== 'darwin' || PROXY_KEYS.some((key) => environment[key])) return {};
  try {
    const { stdout } = await execute('/usr/sbin/scutil', ['--proxy'], { timeout: 2000, maxBuffer: 64 * 1024 });
    const proxy = parseSystemProxy(stdout);
    if (Object.keys(proxy).length && !environment.NO_PROXY && !environment.no_proxy) {
      proxy.NO_PROXY = 'localhost,127.0.0.1,::1';
    }
    return proxy;
  } catch { return {}; }
}

export function parseSystemProxy(source: string): NodeJS.ProcessEnv {
  const field = (name: string) => new RegExp('^\\s*' + name + '\\s*:\\s*(\\S+)\\s*$', 'm').exec(source)?.[1];
  const proxy = (scheme: string) => {
    if (field(scheme + 'Enable') !== '1') return undefined;
    const host = field(scheme + 'Proxy');
    const port = Number(field(scheme + 'Port'));
    if (!host || !/^[a-zA-Z0-9.\-\[\]:]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
    try {
      const url = new URL('http://' + host + ':' + port);
      if (url.username || url.password || url.port !== String(port) && port !== 80) return undefined;
      return url.origin;
    } catch { return undefined; }
  };
  const https = proxy('HTTPS');
  const http = proxy('HTTP');
  return { ...(https ? { HTTPS_PROXY: https } : {}), ...(http ? { HTTP_PROXY: http } : {}) };
}
