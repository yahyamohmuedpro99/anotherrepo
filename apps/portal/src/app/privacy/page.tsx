import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { t } from '@/lib/strings';

export const metadata: Metadata = { title: 'الخصوصية · Privacy' };

/** Draft notice that mirrors docs/COMPLIANCE.md; counsel reviews it before launch (BRIEF §11). */
export default async function Privacy() {
  const lang = await getLang();
  return (
    <article className="r-stack" style={{ maxInlineSize: '70ch' }}>
      <h1>{t(lang, 'privacy.title')}</h1>
      <p className="r-notice">{t(lang, 'privacy.draft')}</p>
      <section lang="ar" dir="rtl" className="r-card">
        <h2>بالعربي</h2>
        <ul>
          <li>الطالب اللي بيلعب من كود QR من غير فصل: مش بنخزّن عنه أي بيانات شخصية على السيرفر. بنعدّ مرات اللعب بس.</li>
          <li>الطالب في فصل: بنخزّن الاسم اللي ظاهر في الفصل (مش لازم اسمه الحقيقي)، وإجاباته وتقدّمه في الرحلات. مفيش إيميل ولا تليفون.</li>
          <li>المدرسة هي اللي بتجمع موافقة ولي الأمر، وإحنا بنسجّل إنها موجودة.</li>
          <li>المدرسة تقدر تطلب تصدير أو مسح بيانات أي طالب أو الفصل كله أو المدرسة كلها في أي وقت.</li>
          <li>بيانات الطلبة بتتخزّن في المنطقة اللي المدرسة متفقة عليها، ومبنبعتهاش لأي حد تاني.</li>
          <li>مفيش إعلانات، ولا أدوات تتبّع، ولا تسجيل لشاشة الطالب.</li>
          <li>الحصص المباشرة: الطلبة بيبعتوا رسايل جاهزة بس، من غير شات حر ولا صوت ولا رسايل خاصة.</li>
        </ul>
      </section>
      <section lang="en" dir="ltr" className="r-card">
        <h2>In English</h2>
        <ul>
          <li>A student playing from a QR code without a class: we store no personal data on the server, only play counts.</li>
          <li>A student in a class: we store the display name shown in class (it need not be their real name), their answers and their progress. No email or phone.</li>
          <li>The school collects parental consent; we store the record that it exists.</li>
          <li>The school can ask us to export or delete the data of one student, a class or the whole school at any time.</li>
          <li>Student data is stored in the region agreed with the school and is never shared with anyone else.</li>
          <li>No ads, no trackers and no screen recording.</li>
          <li>Live sessions: students send preset phrases only. No free chat, no voice, no private messages.</li>
        </ul>
      </section>
    </article>
  );
}
