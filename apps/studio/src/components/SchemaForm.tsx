import { useState, type ReactNode } from 'react';
import { Value } from '@sinclair/typebox/value';
import type { TSchema } from '@sinclair/typebox';
import { localePath, useStudio } from '../lib/store';

type Schema = TSchema & {
  type?: string;
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema | Schema[];
  const?: unknown;
  pattern?: string;
  description?: string;
  patternProperties?: Record<string, Schema>;
  minItems?: number;
  maxItems?: number;
  $ref?: string;
  $id?: string;
};

const isTextKey = (s: Schema) => s.type === 'string' && s.description === 'Locale key';
const isLiteralUnion = (s: Schema) => !!s.anyOf?.length && s.anyOf.every((x) => x.const !== undefined);
const isTextRef = (s: Schema) => !!s.anyOf && s.anyOf.length === 2 && isTextKey(s.anyOf[0]!) && s.anyOf[1]!.type === 'object';
const isTuple = (s: Schema) => s.type === 'array' && Array.isArray(s.items);
const isPoint = (s: Schema) => !!s.anyOf && s.anyOf.every(isTuple);

/** A locale key with its text in every locale, edited side by side (BRIEF §8). */
export function TextKeyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { files, set, locales } = useStudio();
  return (
    <div className="tk">
      <input className="r-input mono" value={value} onChange={(e) => onChange(e.target.value)} aria-label="key" dir="ltr" />
      {locales.map((l) => {
        const table = (files[localePath(l)] ?? {}) as Record<string, string>;
        const text = table[value];
        return (
          <label key={l} className={`tk-row${text === undefined || text === '' ? ' missing' : ''}`}>
            <span className="tk-lang">{l}</span>
            <textarea
              className="r-textarea"
              rows={Math.min(6, Math.max(1, Math.ceil((text ?? '').length / 70)))}
              dir={l.startsWith('ar') ? 'rtl' : 'ltr'}
              lang={l}
              value={text ?? ''}
              onChange={(e) => set(localePath(l), { ...table, [value]: e.target.value })}
            />
          </label>
        );
      })}
    </div>
  );
}

function JsonField({ value, schema, onChange }: { value: unknown; schema: Schema; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 1));
  const [bad, setBad] = useState('');
  return (
    <div>
      <textarea
        className="r-textarea mono"
        dir="ltr"
        rows={Math.min(14, text.split('\n').length + 1)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const v = JSON.parse(e.target.value);
            const ok = schema.$ref || schema.$id ? true : Value.Check(schema, v);
            setBad(ok ? '' : [...Value.Errors(schema, v)].slice(0, 2).map((x) => `${x.path} ${x.message}`).join('; '));
            onChange(v);
          } catch (err) {
            setBad(String((err as Error).message));
          }
        }}
      />
      {bad ? <small className="bad">{bad}</small> : null}
    </div>
  );
}

function Labelled({ name, children, onRemove }: { name: string; children: ReactNode; onRemove?: () => void }) {
  return (
    <div className="sf-field">
      <div className="sf-label">
        <code>{name}</code>
        {onRemove ? (
          <button type="button" className="x" onClick={onRemove} aria-label={`remove ${name}`}>
            ×
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const defaultFor = (s: Schema): unknown => {
  if (isTextKey(s) || s.type === 'string') return '';
  if (isLiteralUnion(s)) return s.anyOf![0]!.const;
  if (isTextRef(s)) return '';
  if (isPoint(s)) return [0, 0];
  if (s.type === 'number' || s.type === 'integer') return 0;
  if (s.type === 'boolean') return false;
  if (isTuple(s)) return (s.items as Schema[]).map(() => 0);
  if (s.type === 'array') return [];
  if (s.type === 'object' && s.properties) {
    const o: Record<string, unknown> = {};
    for (const k of s.required ?? []) o[k] = defaultFor(s.properties[k]!);
    return o;
  }
  return null;
};

/** Renders a form for any TypeBox schema in the pack format. Recursive conditions and actions fall back to JSON. */
export function SchemaForm({ schema, value, onChange, name = '' }: { schema: Schema; value: unknown; onChange: (v: unknown) => void; name?: string }) {
  const { t } = useStudio();
  if (isTextKey(schema)) return <TextKeyField value={String(value ?? '')} onChange={onChange} />;
  if (isTextRef(schema)) {
    if (typeof value === 'object' && value) {
      const v = value as { key: string; params?: unknown };
      return (
        <div className="r-stack" style={{ gap: 6 }}>
          <TextKeyField value={v.key} onChange={(k) => onChange({ ...v, key: k })} />
          <JsonField value={v.params ?? {}} schema={schema.anyOf![1]!.properties!.params as Schema} onChange={(p) => onChange({ ...v, params: p })} />
        </div>
      );
    }
    return <TextKeyField value={String(value ?? '')} onChange={onChange} />;
  }
  if (isLiteralUnion(schema))
    return (
      <select className="r-select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={name}>
        {schema.anyOf!.map((o) => (
          <option key={String(o.const)} value={String(o.const)}>
            {String(o.const)}
          </option>
        ))}
      </select>
    );
  if (isPoint(schema) || isTuple(schema)) {
    const arr = Array.isArray(value) ? (value as number[]) : [];
    return (
      <div className="r-row nums" dir="ltr">
        {arr.map((n, i) => (
          <input key={i} className="r-input" type="number" step="any" value={n} aria-label={`${name}[${i}]`} onChange={(e) => onChange(arr.map((x, j) => (j === i ? Number(e.target.value) : x)))} />
        ))}
        {isPoint(schema) ? (
          <button type="button" className="r-btn" onClick={() => onChange(arr.length === 2 ? [arr[0], 0, arr[1]] : [arr[0], arr[2] ?? 0])}>
            {arr.length === 2 ? 'x,z → x,y,z' : 'x,y,z → x,z'}
          </button>
        ) : null}
      </div>
    );
  }
  if (schema.type === 'number' || schema.type === 'integer')
    return <input className="r-input" type="number" step={schema.type === 'integer' ? 1 : 'any'} dir="ltr" value={value === undefined ? '' : Number(value)} onChange={(e) => onChange(Number(e.target.value))} aria-label={name} />;
  if (schema.type === 'boolean') return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} aria-label={name} />;
  if (schema.type === 'string') return <input className="r-input" dir="auto" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-label={name} />;
  if (schema.type === 'array' && schema.items && !Array.isArray(schema.items)) {
    const item = schema.items as Schema;
    const arr = Array.isArray(value) ? value : [];
    if (item.$ref || item.$id || (item.anyOf && !isLiteralUnion(item) && !isTextRef(item) && !isPoint(item)) || (item.type === 'string' && !isTextKey(item))) return <JsonField value={arr} schema={schema} onChange={onChange} />;
    return (
      <div className="sf-array">
        {arr.map((v, i) => (
          <div key={i} className="sf-item">
            <SchemaForm schema={item} value={v} name={`${name}[${i}]`} onChange={(nv) => onChange(arr.map((x, j) => (j === i ? nv : x)))} />
            <button type="button" className="r-btn danger" onClick={() => onChange(arr.filter((_, j) => j !== i))}>
              {t('remove')}
            </button>
          </div>
        ))}
        <button type="button" className="r-btn" onClick={() => onChange([...arr, defaultFor(item)])}>
          {t('add')}
        </button>
      </div>
    );
  }
  if (schema.type === 'object' && schema.properties) {
    const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const req = new Set(schema.required ?? []);
    const present = Object.keys(schema.properties).filter((k) => req.has(k) || obj[k] !== undefined);
    const absent = Object.keys(schema.properties).filter((k) => !present.includes(k));
    return (
      <div className="sf-object">
        {present.map((k) => (
          <Labelled
            key={k}
            name={k}
            {...(req.has(k)
              ? {}
              : {
                  onRemove: () => {
                    const { [k]: _, ...rest } = obj;
                    onChange(rest);
                  },
                })}
          >
            <SchemaForm schema={schema.properties![k]!} value={obj[k]} name={k} onChange={(v) => onChange({ ...obj, [k]: v })} />
          </Labelled>
        ))}
        {absent.length ? (
          <select className="r-select add-field" value="" onChange={(e) => e.target.value && onChange({ ...obj, [e.target.value]: defaultFor(schema.properties![e.target.value]!) })} aria-label={t('add')}>
            <option value="">+ {t('add')}…</option>
            {absent.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    );
  }
  return <JsonField value={value} schema={schema} onChange={onChange} />;
}
