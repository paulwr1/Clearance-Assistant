import JSZip from 'jszip';

// Liest das DPP-Hotlineformular (.docx) aus und baut daraus
// 1) die einzelnen Archiv-Felder und 2) den Text für „Anfrage / Antwort“.

export type TableMode = 'table' | 'text';

export interface DocxData {
  ticketNr: string;
  sapNr: string;
  mandant: string;
  stichtag: string;
  betreff: string;
  bearbeiter: string;
  reviewer: string;
  stichworte: string;
  imageCount: number;
  tableCount: number;
  render: (mode: TableMode) => { html: string; text: string };
}

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------- kleine XML-Helfer ----------

function kids(el: Element | null | undefined, name?: string): Element[] {
  const out: Element[] = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || (n as Element).localName === name)) out.push(n as Element);
  }
  return out;
}

const first = (el: Element | null | undefined, name: string) => kids(el, name)[0];

function textOf(el: Element): string {
  let s = '';
  const walk = (e: Element) => {
    for (const k of kids(e)) {
      const n = k.localName;
      if (n === 't') s += k.textContent ?? '';
      else if (n === 'tab') s += ' ';
      else if (n === 'br' || n === 'cr' || n === 'p') {
        if (n === 'p') walk(k);
        s += ' ';
      } else if (n !== 'del' && n !== 'instrText') walk(k);
    }
  };
  walk(el);
  return s.replace(/\s+/g, ' ').trim();
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function isOn(el: Element | undefined): boolean {
  if (!el) return false;
  const v = el.getAttribute('w:val');
  return v === null || !['0', 'false', 'none', 'off'].includes(v);
}

const hasDrawing = (el: Element) =>
  el.getElementsByTagNameNS(NS, 'drawing').length > 0 ||
  el.getElementsByTagNameNS(NS, 'pict').length > 0 ||
  el.getElementsByTagNameNS(NS, 'object').length > 0;

// ---------- Absätze ----------

interface Para {
  html: string;
  text: string;
  empty: boolean;
  image: boolean;
  list: boolean;
  heading: boolean;
}

function renderParagraph(p: Element): Para {
  const pPr = first(p, 'pPr');
  const style = first(pPr, 'pStyle')?.getAttribute('w:val') ?? '';
  const heading = /berschrift|heading|fett|title/i.test(style);
  const list = !!first(pPr, 'numPr') || /liste|list/i.test(style);
  let image = false;

  const segs: { t: string; b: boolean; i: boolean; u: boolean }[] = [];
  const push = (t: string, b: boolean, i: boolean, u: boolean) => {
    const last = segs[segs.length - 1];
    if (last && last.b === b && last.i === i && last.u === u) last.t += t;
    else segs.push({ t, b, i, u });
  };

  const run = (r: Element) => {
    const rPr = first(r, 'rPr');
    const b = heading || isOn(first(rPr, 'b'));
    const i = isOn(first(rPr, 'i'));
    const uEl = first(rPr, 'u');
    const u = !!uEl && uEl.getAttribute('w:val') !== 'none';
    for (const k of kids(r)) {
      const n = k.localName;
      if (n === 't') push(k.textContent ?? '', b, i, u);
      else if (n === 'tab') push(' ', b, i, u);
      else if (n === 'br' || n === 'cr') push('\n', b, i, u);
      else if (n === 'drawing' || n === 'pict' || n === 'object') image = true;
      else if (n === 'AlternateContent' && hasDrawing(k)) image = true;
    }
  };

  const walk = (el: Element) => {
    for (const k of kids(el)) {
      const n = k.localName;
      if (n === 'r') run(k);
      else if (['hyperlink', 'ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent', 'customXml'].includes(n)) walk(k);
    }
  };
  walk(p);

  let html = '';
  let text = '';
  for (const s of segs) {
    let h = esc(s.t).replace(/\n/g, '<br>');
    if (s.u) h = `<u>${h}</u>`;
    if (s.i) h = `<em>${h}</em>`;
    if (s.b && s.t.trim()) h = `<strong>${h}</strong>`;
    html += h;
    text += s.t;
  }
  html = html.trim();
  text = text.replace(/[ \t]+/g, ' ').trim();
  return { html, text, empty: !text, image, list, heading };
}

// ---------- Tabellen ----------

function cellContent(tc: Element): { html: string; text: string } {
  const htmls: string[] = [];
  const texts: string[] = [];
  for (const k of kids(tc)) {
    if (k.localName === 'p') {
      const p = renderParagraph(k);
      if (!p.empty) {
        htmls.push((p.list ? '• ' : '') + p.html);
        texts.push((p.list ? '• ' : '') + p.text);
      }
    } else if (k.localName === 'tbl') {
      const t = textOf(k);
      if (t) {
        htmls.push(esc(t));
        texts.push(t);
      }
    }
  }
  return { html: htmls.join('<br>'), text: texts.join(' ') };
}

const CELL = 'border:1px solid #9ca3af;padding:4px 8px;vertical-align:top;';

function renderDataTable(tbl: Element, mode: TableMode): { html: string; text: string } {
  const rows = kids(tbl, 'tr').map((tr) =>
    kids(tr, 'tc').map((tc) => {
      const span = Number(first(first(tc, 'tcPr'), 'gridSpan')?.getAttribute('w:val') ?? '1');
      return { ...cellContent(tc), span };
    }),
  );
  const nonEmpty = rows.filter((r) => r.some((c) => c.text));
  if (nonEmpty.length === 0) return { html: '', text: '' };

  if (mode === 'table') {
    const trs = nonEmpty
      .map((r, ri) => {
        const tds = r
          .map(
            (c) =>
              `<td${c.span > 1 ? ` colspan="${c.span}"` : ''} style="${CELL}${ri === 0 ? 'font-weight:bold;background:#f3f4f6;color:#111827;' : ''}">${c.html || '&nbsp;'}</td>`,
          )
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    const text = nonEmpty.map((r) => r.map((c) => c.text).join(' | ')).join('\n');
    return {
      html: `<table style="border-collapse:collapse;margin:4px 0;">${trs}</table>`,
      text,
    };
  }

  // Text-Modus: jede Zeile als eigene, gut lesbare Zeile
  const header = nonEmpty[0].map((c) => c.text);
  const lines: { html: string; text: string }[] = [];
  lines.push({
    html: `<strong>${header.map(esc).filter(Boolean).join(' · ')}</strong>`,
    text: header.filter(Boolean).join(' · '),
  });
  for (const r of nonEmpty.slice(1)) {
    const label = r[0]?.text ?? '';
    const rest = r.slice(1);
    let restHtml: string;
    let restText: string;
    if (rest.length <= 1) {
      restHtml = rest[0]?.html ?? '';
      restText = rest[0]?.text ?? '';
    } else {
      restHtml = rest
        .map((c, i) => (header[i + 1] ? `${esc(header[i + 1])}: ` : '') + (c.html || '–'))
        .join(' · ');
      restText = rest
        .map((c, i) => (header[i + 1] ? `${header[i + 1]}: ` : '') + (c.text || '–'))
        .join(' · ');
    }
    lines.push({
      html: label ? `<strong>${esc(label)}:</strong> ${restHtml}` : restHtml,
      text: label ? `${label}: ${restText}` : restText,
    });
  }
  return {
    html: lines.map((l) => `<p>${l.html}</p>`).join(''),
    text: lines.map((l) => l.text).join('\n'),
  };
}

// ---------- Felder aus den Formular-Tabellen ----------

const norm = (s: string) => s.replace(/[:*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const cleanValue = (s: string | undefined) => {
  const v = (s ?? '').trim();
  return /^\[.*\]$/.test(v) ? '' : v;
};

function findValue(tables: Element[], label: string, direction: 'right' | 'below'): string {
  const l = label.toLowerCase();
  for (const tbl of tables) {
    const rows = kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map(textOf));
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cell = norm(rows[r][c]);
        if (cell === l || (cell.startsWith(l) && cell.length < l.length + 20)) {
          const v = direction === 'right' ? rows[r][c + 1] : rows[r + 1]?.[c];
          if (cleanValue(v)) return cleanValue(v);
        }
      }
    }
  }
  return '';
}

// ---------- Hauptfunktion ----------

export async function parseDocx(file: Blob): Promise<DocxData> {
  const zip = await JSZip.loadAsync(file);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('Das ist keine gültige Word-Datei (.docx).');
  const xml = await xmlFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(NS, 'body')[0];
  if (!body) throw new Error('Word-Datei konnte nicht gelesen werden.');

  const topTables = kids(body, 'tbl');

  const ticketRaw = findValue(topTables, 'ticket-nummer', 'right') || findValue(topTables, 'ticket', 'right');
  const nums = ticketRaw.match(/\d{4,}/g) ?? [];
  let ticketNr = nums[0] ?? '';
  const sapNr = nums[1] ?? '';
  if (!ticketNr) {
    const m = textOf(body).match(/Ticket[- ]?(?:Nummer|Nr\.?)[^0-9]{0,40}(\d{5,})/i);
    ticketNr = m?.[1] ?? '';
  }

  const fields = {
    ticketNr,
    sapNr,
    mandant: findValue(topTables, 'mandant', 'below') || findValue(topTables, 'mandant', 'right'),
    stichtag: findValue(topTables, 'stichtag', 'below') || findValue(topTables, 'stichtag', 'right'),
    betreff: findValue(topTables, 'betreff', 'right'),
    bearbeiter: findValue(topTables, 'dpp bearbeiter', 'right'),
    reviewer: findValue(topTables, 'dpp reviewer', 'right'),
  };

  // Stichworte + Zählung einmal vorab ermitteln
  let stichworte = '';
  let imageCount = 0;
  let tableCount = 0;

  const render = (mode: TableMode) => {
    const blocks: { html: string; text: string }[] = [];
    const placeholder = `[Grafik einsehbar unter Ticket Nr. ${ticketNr || 'XXXXX'}]`;
    let skipping = false; // true, solange wir im Abschnitt „Stichworte“ sind
    let listBuf: Para[] = [];
    imageCount = 0;
    tableCount = 0;

    const flushList = () => {
      if (!listBuf.length) return;
      blocks.push({
        html: `<ul>${listBuf.map((p) => `<li>${p.html}</li>`).join('')}</ul>`,
        text: listBuf.map((p) => `• ${p.text}`).join('\n'),
      });
      listBuf = [];
    };

    const addParagraph = (p: Para) => {
      if (p.image) {
        flushList();
        if (!p.empty) blocks.push({ html: `<p>${p.html}</p>`, text: p.text });
        blocks.push({ html: `<p><em>${esc(placeholder)}</em></p>`, text: placeholder });
        imageCount++;
        return;
      }
      if (p.empty || /^[-_=–]{5,}$/.test(p.text)) return;
      if (p.list) {
        listBuf.push(p);
        return;
      }
      flushList();
      blocks.push({ html: `<p>${p.html}</p>`, text: p.text });
    };

    // Inhalt innerhalb eines Abschnitts (Zelle): Absätze, Listen, echte Tabellen
    const addContent = (container: Element) => {
      for (const k of kids(container)) {
        if (k.localName === 'p') {
          if (skipping) {
            const t = renderParagraph(k).text;
            if (t) stichworte = stichworte ? `${stichworte} ${t}` : t;
          } else addParagraph(renderParagraph(k));
        } else if (k.localName === 'tbl' && !skipping) {
          flushList();
          const t = renderDataTable(k, mode);
          if (t.text) {
            blocks.push(t);
            tableCount++;
          }
        } else if (k.localName === 'sdt') {
          addContent(first(k, 'sdtContent') ?? k);
        }
      }
    };

    const setHeading = (title: string) => {
      flushList();
      skipping = /^stichw/i.test(title);
      if (skipping) {
        stichworte = '';
        return;
      }
      blocks.push({ html: `<p><strong>${esc(title)}</strong></p>`, text: title.toUpperCase() });
    };

    for (const el of kids(body)) {
      if (el.localName === 'p') {
        const p = renderParagraph(el);
        if (p.heading && !p.empty && !p.image) setHeading(p.text);
        else if (!skipping) addParagraph(p);
        continue;
      }
      if (el.localName !== 'tbl') continue;

      const rows = kids(el, 'tr');
      const cols = kids(first(el, 'tblGrid'), 'gridCol').length || Math.max(...rows.map((r) => kids(r, 'tc').length));
      const allCells = rows.flatMap((r) => kids(r, 'tc').map((c) => norm(textOf(c))));

      // Kopf-Tabelle (Mandant / Stichtag / AP Referenz) → nur Felder, nicht in den Text
      if (allCells.includes('mandant') && allCells.includes('stichtag')) continue;

      if (cols === 1) {
        // Abschnitts-Tabelle: Überschrift-Zeile + Inhalts-Zeilen
        for (const tr of rows) {
          for (const tc of kids(tr, 'tc')) {
            const paras = kids(tc).filter((k) => k.localName === 'p' || k.localName === 'tbl');
            const nonEmpty = paras.filter((k) => k.localName === 'tbl' || !renderParagraph(k).empty);
            const only = nonEmpty.length === 1 && nonEmpty[0].localName === 'p' ? renderParagraph(nonEmpty[0]) : null;
            if (only && only.heading && only.text.length < 120) setHeading(only.text);
            else addContent(tc);
          }
        }
        flushList();
        continue;
      }

      // Mehrspaltige Formular-Tabelle (Betreff, Ticket-Nummer, Bearbeiter …) → „Label: Wert“
      flushList();
      skipping = false;
      for (const tr of rows) {
        const cells = kids(tr, 'tc').map(cellContent);
        if (cells.filter((c) => c.text).length < 2) continue;
        if (/^(Ticket|DPP Bearbeiter|DPP Reviewer)/i.test(cells[0].text.trim())) continue;
        const [label, ...rest] = cells;
        blocks.push({
          html: `<p><strong>${label.html}:</strong> ${rest.map((c) => c.html).join(' ')}</p>`,
          text: `${label.text}: ${rest.map((c) => c.text).join(' ')}`,
        });
      }
    }
    flushList();

    return {
      html: blocks.map((b) => b.html).join('<p><br></p>'),
      text: blocks.map((b) => b.text).join('\n\n'),
    };
  };

  render('table'); // füllt stichworte / imageCount / tableCount

  return { ...fields, stichworte: stichworte.trim(), imageCount, tableCount, render };
}
