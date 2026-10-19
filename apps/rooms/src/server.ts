import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ClassRoom, type RoomDeps } from './class-room.js';

/** Builds the rooms server. Rooms are keyed by live-session id (filterBy sid). */
export function buildRooms(deps: RoomDeps): { http: HttpServer; game: Server } {
  ClassRoom.deps = deps;
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    }
  });
  const game = new Server({ transport: new WebSocketTransport({ server: http, pingInterval: 5000, pingMaxRetries: 3 }), greet: false });
  game.define('class', ClassRoom).filterBy(['sid']);
  return { http, game };
}

/** Reports moderation actions and session ends to the API (fire and forget; the room never waits on it). */
export function apiReporter(apiUrl: string, secret: string): RoomDeps {
  const post = (path: string, body: unknown) =>
    fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-secret': secret }, body: JSON.stringify(body) }).catch((e) => console.error('[rooms] api', path, String(e)));
  return {
    secret: '',
    log: (entry) => void post('/internal/rooms/log', entry),
    ended: (tenantId, sessionId) => void post('/internal/rooms/ended', { tenantId, sessionId }),
  };
}
