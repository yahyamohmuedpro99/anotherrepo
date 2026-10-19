'use client';
import { use, useEffect, useRef, useState } from 'react';
import { Badge, Button, Notice, Select, Table } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface SessionInfo {
  session: { id: string; classId: string; assignmentId: string | null; status: 'active' | 'ended' };
  roster: { id: string; name: string }[];
  roomToken: string | null;
}
interface RosterEntry { sessionId: string; studentId: string; name: string; role: 'student' | 'teacher'; muted: boolean }
interface Room { send(type: string, data?: unknown): void; leave(): Promise<unknown>; onMessage(type: string, cb: (m: never) => void): void; onLeave(cb: () => void): void }

const ROOMS = process.env.NEXT_PUBLIC_ROOMS_URL ?? 'ws://localhost:2567';

/** Teacher hooks (BRIEF §6, §10): big buttons, projector-friendly. */
function Live({ id }: { id: string }) {
  const { t, n, pick } = useLang();
  const { api } = useSession();
  const info = useData(() => api.get<SessionInfo>('/v1/sessions/{id}', { params: { id } }), [api, id]);
  const asgPack = useData(async () => {
    const a = info.data?.session.assignmentId;
    if (!a) return null;
    const list = await api.get<{ assignments: { id: string; packId: string }[] }>('/v1/classes/{id}/assignments', { params: { id: info.data!.session.classId } });
    const packId = list.assignments.find((x) => x.id === a)?.packId;
    return packId ? api.get<{ pois: { id: string; title: Record<string, string> }[]; items: { id: string; prompt: Record<string, string> }[] }>('/v1/packs/{id}', { params: { id: packId } }) : null;
  }, [api, info.data]);
  const room = useRef<Room | null>(null);
  const [state, setState] = useState<'connecting' | 'connected' | 'offline' | 'ended'>('connecting');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [poi, setPoi] = useState('');
  const [item, setItem] = useState('');
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    const token = info.data?.roomToken ?? sessionStorage.getItem(`room:${id}`);
    if (!token || info.data?.session.status === 'ended') {
      if (info.data) setState('ended');
      return;
    }
    let live = true;
    (async () => {
      try {
        const { Client } = await import('colyseus.js');
        const r = (await new Client(ROOMS).joinOrCreate('class', { token, sid: id })) as unknown as Room;
        if (!live) return void r.leave();
        room.current = r;
        r.onMessage('roster', (m: { roster: RosterEntry[] }) => setRoster(m.roster));
        r.onMessage('peers', () => {});
        r.onMessage('phrase', () => {});
        r.onMessage('emote', () => {});
        r.onMessage('teacher', (m: { type: string }) => m.type === 'end' && setState('ended'));
        r.onLeave(() => setState((s) => (s === 'ended' ? s : 'offline')));
        setState('connected');
      } catch {
        if (live) setState('offline');
      }
    })();
    return () => {
      live = false;
      void room.current?.leave();
    };
  }, [id, info.data]);

  const send = (type: string, data: unknown) => room.current?.send(type, data);
  const students = roster.filter((r) => r.role === 'student');
  if (!info.data) return <ErrorLine error={info.error} />;
  return (
    <div className="r-stack" style={{ gap: 18 }}>
      <div className="r-row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('live.title')}</h1>
        <Badge tone={state === 'connected' ? 'ok' : 'warn'}>{state === 'connected' ? t('live.connected') : state === 'ended' ? t('live.ended') : state}</Badge>
      </div>
      {state === 'offline' ? <Notice error>{t('live.offline')}</Notice> : null}
      <ErrorLine error={err} />
      <p style={{ fontSize: 22 }}>{t('live.inRoom', { n: students.length })}</p>
      <div className="live-grid">
        <Button big tone={paused ? 'gold' : 'primary'} disabled={state !== 'connected'} onClick={() => (send('teacher', { type: paused ? 'resume' : 'pause' }), setPaused(!paused))}>
          {paused ? t('live.resume') : t('live.pause')}
        </Button>
        <Button big tone={locked ? 'gold' : 'default'} disabled={state !== 'connected'} onClick={() => (send('teacher', { type: 'lockMovement', on: !locked }), setLocked(!locked))}>
          {locked ? t('live.unlock') : t('live.lock')}
        </Button>
        <Button big disabled={state !== 'connected'} onClick={() => send('moderate', { action: 'mute-all' })}>
          {t('live.muteAll')}
        </Button>
        <Button
          big
          tone="danger"
          disabled={state === 'ended'}
          onClick={async () => {
            if (!confirm(t('live.endConfirm'))) return;
            send('teacher', { type: 'end' });
            try {
              await api.post('/v1/sessions/{id}/end', undefined, { params: { id } });
            } catch (x) {
              setErr(x);
            }
            setState('ended');
          }}
        >
          {t('live.end')}
        </Button>
      </div>
      <div className="r-grid">
        <section className="r-card r-stack">
          <h2>{t('live.gather')}</h2>
          <Select value={poi} onChange={(e) => setPoi(e.target.value)}>
            <option value="">—</option>
            {(asgPack.data?.pois ?? []).map((p) => (
              <option key={p.id} value={p.id}>{pick(p.title)}</option>
            ))}
          </Select>
          <Button big disabled={!poi || state !== 'connected'} onClick={() => send('teacher', { type: 'gather', poiId: poi })}>
            {t('live.gather')}
          </Button>
        </section>
        <section className="r-card r-stack">
          <h2>{t('live.question')}</h2>
          <Select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">—</option>
            {(asgPack.data?.items ?? []).map((i) => (
              <option key={i.id} value={i.id}>{pick(i.prompt) || i.id}</option>
            ))}
          </Select>
          <Button big disabled={!item || state !== 'connected'} onClick={() => send('teacher', { type: 'pushQuestion', itemId: item })}>
            {t('live.question')}
          </Button>
        </section>
      </div>
      <Table
        head={[t('report.student'), '', '', '']}
        rows={students.map((s) => [
          s.name,
          <Button key="s" onClick={() => send('teacher', { type: 'spotlight', studentId: s.studentId, name: s.name })}>{t('live.spotlight')}</Button>,
          <Button key="m" onClick={() => send('moderate', { action: s.muted ? 'unmute' : 'mute', studentId: s.studentId })}>{s.muted ? t('live.unmute') : t('live.mute')}</Button>,
          <Button key="r" tone="danger" onClick={() => send('moderate', { action: 'remove', studentId: s.studentId })}>{t('live.remove')}</Button>,
        ])}
        empty={n(0)}
      />
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Guard roles={['teacher', 'school_admin']}>
      <Live id={id} />
    </Guard>
  );
}
