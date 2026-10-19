import { describe, expect, it } from 'vitest';
import { createTranslator, dirOf, format, formatList, formatNumber } from '../src/index.js';

describe('numerals', () => {
  it('uses Eastern Arabic digits for ar-EG and never mixes systems', () => {
    expect(formatNumber(146.6, 'ar-EG')).toBe('١٤٦٫٦');
    expect(formatNumber(146.6, 'ar-EG', 'latn')).toBe('146.6');
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
  it('directions', () => {
    expect(dirOf('ar-EG')).toBe('rtl');
    expect(dirOf('ar-SA')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
  it('lists use the Arabic comma in Arabic', () => {
    expect(formatList(['خوفو', 'خفرع', 'منكاورع'], 'ar-EG')).toBe('خوفو، خفرع، منكاورع');
    expect(formatList(['a', 'b'], 'en')).toBe('a, b');
  });
});

describe('ICU subset', () => {
  it('formats arguments and numbers by locale', () => {
    expect(format('معاك {n} من {m}', { n: 2, m: 4 }, { locale: 'ar-EG' })).toBe('معاك ٢ من ٤');
    expect(format('{n} of {m}', { n: 2, m: 4 }, { locale: 'en' })).toBe('2 of 4');
  });
  it('handles plural with # and exact matches', () => {
    const src = '{n, plural, =0 {no scarabs} one {# scarab} other {# scarabs}}';
    expect(format(src, { n: 0 }, { locale: 'en' })).toBe('no scarabs');
    expect(format(src, { n: 1 }, { locale: 'en' })).toBe('1 scarab');
    expect(format(src, { n: 3 }, { locale: 'en' })).toBe('3 scarabs');
    const ar = '{n, plural, one {مسافر واحد} two {مسافرين اتنين} few {# مسافرين} many {# مسافر} other {# مسافر}}';
    expect(format(ar, { n: 1 }, { locale: 'ar-EG' })).toBe('مسافر واحد');
    expect(format(ar, { n: 2 }, { locale: 'ar-EG' })).toBe('مسافرين اتنين');
    expect(format(ar, { n: 5 }, { locale: 'ar-EG' })).toBe('٥ مسافرين');
  });
  it('handles select and quoting', () => {
    expect(format('{g, select, f {she} other {they}}', { g: 'f' }, { locale: 'en' })).toBe('she');
    expect(format("It''s '{literal}'", {}, { locale: 'en' })).toBe("It's {literal}");
  });
});

describe('translator', () => {
  it('falls back through tables and reports missing keys once', () => {
    const missing: string[] = [];
    const tr = createTranslator('ar-EG', [{ a: 'أ' }], { fallbackTables: [{ b: 'B' }], onMissing: (k) => missing.push(k) });
    expect(tr.t('a')).toBe('أ');
    expect(tr.t('b')).toBe('B');
    expect(tr.t('c')).toBe('c');
    tr.t('c');
    expect(missing).toEqual(['c']);
  });
});
