import { isTeacherCommand, type TeacherCommand } from '../gameplay/teacher.js';

export interface PeerPose {
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  scene: string;
}

export interface RoomHandlers {
  onTeacher(c: TeacherCommand): void;
  onPeer(id: string, p: PeerPose): void;
  onLeave(id: string): void;
  onPhrase(id: string, key: string): void;
}

/**
 * Live class presence through the rooms service (Colyseus). Loaded only when the host passes a room token,
 * so solo play never downloads it. The server broadcasts plain snapshots at 10 Hz; teacher commands arrive
 * as `teacher` messages.
 */
export async function connectRoom(url: string, token: string, h: RoomHandlers): Promise<{ send: (type: string, data: unknown) => void; leave: () => void }> {
  const { Client } = await import('colyseus.js');
  const client = new Client(url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rooms`);
  const room = await client.join('class', { token });
  const known = new Set<string>();
  room.onMessage('peers', (snap: Record<string, PeerPose>) => {
    const seen = new Set<string>();
    for (const [id, p] of Object.entries(snap)) {
      if (id === room.sessionId) continue;
      seen.add(id);
      known.add(id);
      h.onPeer(id, p);
    }
    for (const id of known) if (!seen.has(id)) {
      known.delete(id);
      h.onLeave(id);
    }
  });
  room.onMessage('teacher', (c: unknown) => {
    if (isTeacherCommand(c)) h.onTeacher(c);
  });
  room.onMessage('phrase', (m: { from: string; key: string }) => h.onPhrase(m.from, m.key));
  room.onMessage('*', () => {});
  return {
    send: (type, data) => {
      try {
        room.send(type, data);
      } catch {
        /* connection dropped: solo */
      }
    },
    leave: () => void room.leave(),
  };
}
