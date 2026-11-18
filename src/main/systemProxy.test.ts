import { describe, expect, it } from 'vitest';
import { parseSystemProxy, systemProxyEnvironment } from './systemProxy.js';

describe('system proxy for Codex', () => {
  it('uses enabled HTTP proxies and rejects invalid destinations', () => {
    expect(parseSystemProxy('HTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 7897')).toEqual({ HTTPS_PROXY: 'http://127.0.0.1:7897' });
    expect(parseSystemProxy('HTTPSEnable : 0\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 7897')).toEqual({});
    expect(parseSystemProxy('HTTPSEnable : 1\nHTTPSProxy : user@host\nHTTPSPort : 7897')).toEqual({});
    expect(parseSystemProxy('HTTPSEnable : 1\nHTTPSProxy : localhost\nHTTPSPort : 99999')).toEqual({});
  });
  it('preserves an explicitly configured subprocess proxy', async () => {
    expect(await systemProxyEnvironment({ https_proxy: 'http://localhost:8080' })).toEqual({});
    expect(await systemProxyEnvironment({ ALL_PROXY: 'socks5://localhost:8080' })).toEqual({});
  });
});
