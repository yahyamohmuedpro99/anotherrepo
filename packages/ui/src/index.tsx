import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, AnchorHTMLAttributes } from 'react';

type Tone = 'default' | 'primary' | 'gold' | 'danger';
const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ tone = 'default', big, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; big?: boolean }) {
  return <button type="button" {...rest} className={cls('r-btn', tone !== 'default' && tone, big && 'big', className)} />;
}

export function LinkButton({ tone = 'default', big, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { tone?: Tone; big?: boolean }) {
  return <a {...rest} className={cls('r-btn', tone !== 'default' && tone, big && 'big', className)} />;
}

export function Card({ title, children, actions }: { title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="r-card">
      {title ? <h2>{title}</h2> : null}
      {children}
      {actions ? <div className="r-row" style={{ marginBlockStart: 12 }}>{actions}</div> : null}
    </section>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="r-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cls('r-input', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cls('r-select', p.className)} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cls('r-textarea', p.className)} />;

export function Badge({ tone, children }: { tone?: 'ok' | 'warn'; children: ReactNode }) {
  return <span className={cls('r-badge', tone)}>{children}</span>;
}

export function Stat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="r-stat">
      <span className="r-muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div className={cls('r-notice', error && 'error')} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** A labelled percentage bar (per-objective results). Text carries the number for screen readers. */
export function Bar({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0;
  return (
    <div className="r-stack" style={{ gap: 4 }}>
      <div className="r-row" style={{ justifyContent: 'space-between' }}>
        <span>{label}</span>
        <b className="r-ltr">{value === null ? '–' : `${v}%`}</b>
      </div>
      <div className="r-bar" aria-hidden="true">
        <i style={{ inlineSize: `${v}%` }} />
      </div>
    </div>
  );
}

export function Table({ head, rows, empty }: { head: ReactNode[]; rows: ReactNode[][]; empty?: ReactNode }) {
  return (
    <div className="r-table-wrap">
      <table className="r-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : (
            <tr>
              <td colSpan={head.length} className="r-muted">{empty ?? '—'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
