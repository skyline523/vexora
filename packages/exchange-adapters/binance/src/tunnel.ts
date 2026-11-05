import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { URL } from 'node:url';

async function connectTcp(host: string, port: number, timeoutMs = 8_000): Promise<Socket> {
  return await new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error(`TCP connect timeout ${host}:${port}`));
    };
    const cleanup = () => {
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.setTimeout(0);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      cleanup();
      resolve(socket);
    });
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

function readExact(socket: Socket, size: number, timeoutMs = 8_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('socket read timeout'));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      received += chunk.length;
      if (received >= size) {
        cleanup();
        const buf = Buffer.concat(chunks);
        const exact = buf.subarray(0, size);
        const rest = buf.subarray(size);
        if (rest.length > 0) {
          socket.unshift(rest);
        }
        resolve(exact);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    socket.on('data', onData);
    socket.once('error', onError);
  });
}

/** HTTP CONNECT tunnel to target host:443 */
export async function httpConnectTunnel(
  proxyUrl: string,
  targetHost: string,
  targetPort = 443,
): Promise<Socket> {
  const proxy = new URL(proxyUrl);
  const socket = await connectTcp(
    proxy.hostname,
    Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)),
  );

  socket.write(
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
      `Host: ${targetHost}:${targetPort}\r\n` +
      `Proxy-Connection: Keep-Alive\r\n` +
      `\r\n`,
  );

  const headerBuf = await new Promise<Buffer>((resolve, reject) => {
    let data = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('HTTP CONNECT header timeout'));
    }, 8_000);
    const onData = (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      const idx = data.indexOf('\r\n\r\n');
      if (idx >= 0) {
        cleanup();
        const headers = data.subarray(0, idx + 4);
        const rest = data.subarray(idx + 4);
        if (rest.length > 0) socket.unshift(rest);
        resolve(headers);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });

  const statusLine = headerBuf.toString('utf8').split('\r\n')[0] ?? '';
  if (!/ 200 /.test(statusLine)) {
    socket.destroy();
    throw new Error(`HTTP CONNECT failed: ${statusLine}`);
  }
  return socket;
}

/** Minimal SOCKS5 no-auth CONNECT */
export async function socks5Tunnel(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort = 443,
): Promise<Socket> {
  const socket = await connectTcp(proxyHost, proxyPort);
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  const greet = await readExact(socket, 2);
  if (greet[0] !== 0x05 || greet[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SOCKS5 auth rejected: ${greet.toString('hex')}`);
  }

  const hostBuf = Buffer.from(targetHost, 'utf8');
  const req = Buffer.alloc(7 + hostBuf.length);
  req[0] = 0x05;
  req[1] = 0x01;
  req[2] = 0x00;
  req[3] = 0x03;
  req[4] = hostBuf.length;
  hostBuf.copy(req, 5);
  req.writeUInt16BE(targetPort, 5 + hostBuf.length);
  socket.write(req);

  const head = await readExact(socket, 4);
  if (head[0] !== 0x05 || head[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SOCKS5 connect failed code=${head[1]}`);
  }
  const atyp = head[3];
  if (atyp === 0x01) {
    await readExact(socket, 4 + 2);
  } else if (atyp === 0x03) {
    const len = (await readExact(socket, 1))[0] ?? 0;
    await readExact(socket, len + 2);
  } else if (atyp === 0x04) {
    await readExact(socket, 16 + 2);
  } else {
    socket.destroy();
    throw new Error(`SOCKS5 unknown atyp=${atyp}`);
  }
  return socket;
}

export async function createTlsThroughProxy(options: {
  targetHost: string;
  targetPort?: number;
  httpProxyUrl?: string;
  socksProxy?: { host: string; port: number };
}): Promise<TLSSocket> {
  const targetPort = options.targetPort ?? 443;
  let raw: Socket | undefined;
  const errors: string[] = [];

  if (options.httpProxyUrl) {
    try {
      raw = await httpConnectTunnel(
        options.httpProxyUrl,
        options.targetHost,
        targetPort,
      );
    } catch (error) {
      errors.push(
        `http-connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!raw && options.socksProxy) {
    try {
      raw = await socks5Tunnel(
        options.socksProxy.host,
        options.socksProxy.port,
        options.targetHost,
        targetPort,
      );
    } catch (error) {
      errors.push(
        `socks5: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!raw) {
    throw new Error(
      `Unable to tunnel to ${options.targetHost}: ${errors.join('; ') || 'no proxy'}`,
    );
  }

  return await new Promise<TLSSocket>((resolve, reject) => {
    const tlsSocket = tlsConnect({
      socket: raw,
      servername: options.targetHost,
    });
    const timer = setTimeout(() => {
      tlsSocket.destroy();
      reject(new Error('TLS handshake timeout through proxy'));
    }, 10_000);
    tlsSocket.once('secureConnect', () => {
      clearTimeout(timer);
      resolve(tlsSocket);
    });
    tlsSocket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function inferSocksFromHttpProxy(
  httpProxyUrl: string | undefined,
): { host: string; port: number } | undefined {
  if (!httpProxyUrl) return undefined;
  try {
    const url = new URL(httpProxyUrl);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return undefined;
    }
    const httpPort = Number(url.port);
    // Clash default: HTTP 10809 / SOCKS 10808, or HTTP 7890 / SOCKS 7891
    if (httpPort === 10809) return { host: '127.0.0.1', port: 10808 };
    if (httpPort === 7890) return { host: '127.0.0.1', port: 7891 };
    return undefined;
  } catch {
    return undefined;
  }
}
