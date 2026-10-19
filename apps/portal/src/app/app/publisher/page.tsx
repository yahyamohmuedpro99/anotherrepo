'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Field, Input } from '@rihla/ui';
import { Guard, ErrorLine } from '@/components/Guard';
import { useLang } from '@/components/LangProvider';
import { useSession } from '@/components/Session';
import { useData } from '@/lib/use-data';

interface Book { id: string; title: string; grade: string | null; subject: string | null; country: string }

function Books() {
  const { t } = useLang();
  const { api } = useSession();
  const { data, error, reload } = useData(() => api.get<{ books: Book[] }>('/v1/books'), [api]);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="r-stack" style={{ gap: 20 }}>
      <h1>{t('pub.books')}</h1>
      <ErrorLine error={error ?? err} />
      <div className="r-grid">
        {(data?.books ?? []).map((b) => (
          <Card key={b.id} title={b.title} actions={<Link className="r-btn primary" href={`/app/publisher/books/${b.id}`}>{t('app.open')}</Link>}>
            <p className="r-muted">{[b.country, b.grade, b.subject].filter(Boolean).join(' · ')}</p>
          </Card>
        ))}
        <form className="r-card r-stack" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api.post('/v1/books', { title: String(f.get('title')), grade: String(f.get('grade') || '') || undefined, subject: String(f.get('subject') || '') || undefined });
            (e.target as HTMLFormElement).reset();
            reload();
          } catch (x) { setErr(x); }
        }}>
          <h3>{t('pub.newBook')}</h3>
          <Field label={t('pub.title')}><Input name="title" required /></Field>
          <Field label={t('app.grade')}><Input name="grade" placeholder="P4" /></Field>
          <Field label={t('catalog.subject')}><Input name="subject" placeholder="science" dir="ltr" /></Field>
          <Button type="submit" tone="primary">{t('app.create')}</Button>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['publisher_admin']}><Books /></Guard>;
}
