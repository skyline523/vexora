import { MarketDataEngine } from '@vexora/market-core';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { MarketClientSession } from './market-session';

function messageText(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(new Uint8Array(data)).toString('utf8');
}

@Injectable()
export class MarketStreamService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: WebSocketServer;
  private readonly sessions = new Set<MarketClientSession>();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly engine: MarketDataEngine,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer();
    this.server = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.server.on('connection', (socket: WebSocket) => {
      const session = new MarketClientSession(this.engine, {
        send: (data) => {
          if (socket.readyState === socket.OPEN) socket.send(data);
        },
      });
      this.sessions.add(session);
      socket.on('message', (data) => {
        session.handleMessage(messageText(data));
      });
      const close = (): void => {
        session.close();
        this.sessions.delete(session);
      };
      socket.on('close', close);
      socket.on('error', close);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    for (const session of this.sessions) session.close();
    this.sessions.clear();
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    await this.engine.disconnect();
  }
}
