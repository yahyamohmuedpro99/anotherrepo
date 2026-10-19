/** Commands a teacher's live session sends to every student's engine (BRIEF §4 teacher hooks). */
export type TeacherCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'lockMovement'; on: boolean }
  | { type: 'gather'; poiId: string }
  | { type: 'spotlight'; studentId: string; name: string; at?: [number, number] }
  | { type: 'pushQuestion'; itemId: string }
  | { type: 'end' };

export const TEACHER_COMMANDS = ['pause', 'resume', 'lockMovement', 'gather', 'spotlight', 'pushQuestion', 'end'] as const;

export function isTeacherCommand(v: unknown): v is TeacherCommand {
  return !!v && typeof v === 'object' && TEACHER_COMMANDS.includes((v as { type: string }).type as (typeof TEACHER_COMMANDS)[number]);
}
