export interface CodeInfo {
  type: 'public' | 'book' | 'copy' | 'class';
  packId: string | null;
  poiId: string | null;
  namePolicy?: 'list' | 'typed';
  suggestions?: string[];
}

export interface JoinResult {
  token: string;
  studentId: string;
  classId: string;
  displayName: string;
  roomToken?: string;
  assignment?: { id: string; hints?: boolean; preQuiz?: boolean; postQuiz?: boolean };
}

const deviceId = () => {
  try {
    return localStorage.getItem('rihla.device') ?? '';
  } catch {
    return '';
  }
};

export async function resolveCode(api: string, code: string): Promise<CodeInfo> {
  const res = await fetch(`${api}/v1/codes/${encodeURIComponent(code)}/resolve`, { headers: { 'x-device-id': deviceId() } });
  if (!res.ok) throw new Error(`code ${res.status}`);
  return (await res.json()) as CodeInfo;
}

export async function joinClass(api: string, code: string, displayName: string): Promise<JoinResult> {
  const res = await fetch(`${api}/v1/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, displayName, deviceId: deviceId() }) });
  if (!res.ok) throw new Error(`join ${res.status}`);
  return (await res.json()) as JoinResult;
}
