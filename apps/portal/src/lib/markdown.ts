/** Tiny, safe Markdown → HTML for lesson plans and worksheets: headings, lists, tables, bold, quotes. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');

export function markdown(src: string): string {
  const out: string[] = [];
  const lines = src.replace(/\r/g, '').split('\n');
  let list: 'ul' | 'ol' | null = null;
  let table: string[][] | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
    if (table) {
      const [head, , ...body] = table;
      out.push(`<table><thead><tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    }
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (/^\|.*\|$/.test(line.trim())) {
      if (list) close();
      table ??= [];
      table.push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    if (h) {
      close();
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (table) close();
      if (list !== 'ul') {
        close();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (table) close();
      if (list !== 'ol') {
        close();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
    } else if (/^>\s?/.test(line)) {
      close();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (/^---+$/.test(line)) {
      close();
      out.push('<hr>');
    } else if (!line.trim()) close();
    else {
      close();
      out.push(`<p>${inline(line.trim())}</p>`);
    }
  }
  close();
  return out.join('\n');
}
