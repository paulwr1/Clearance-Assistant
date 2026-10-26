import JSZip from 'jszip';

// Liest DPP-Word-Dokumente (.docx) aus – z. B. Hotlineformular oder PIRB-Freigabeformular –
// und baut daraus 1) die Archiv-Felder und 2) den Text für „Anfrage / Antwort“.

export type TableMode = 'table' | 'text';

export interface DocxData {
  ticketNr: string;
  sapNr: string;
  mandant: string;
  stichtag: string;
  betreff: string;
  bearbeiter: string;
  reviewer: string;
  engManager: string;
  engPartner: string;
  stichworte: string;
  formType: 'hotline' | 'pirb';
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
const BLANK = { html: '<p><br></p>', text: '' };

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
    return { html: `<table style="border-collapse:collapse;margin:4px 0;">${trs}</table>`, text };
  }

  // ---------- Text-Modus (für das Hotline-Archiv: kann keine Tabellen) ----------
  // Buchungssätze (Zelle „an“/„per“, keine Kopfzeile) → jede Zeile als eine Zeile Text
  const isJoin = (s: string) => /^(an|per)$/i.test(s.trim());
  const noHeader = nonEmpty[0].some((c) => isJoin(c.text));
  if (noHeader) {
    const out = nonEmpty.map((r) => {
      const cells = r.filter((c) => c.text);
      const sep = cells.some((c) => isJoin(c.text)) ? ' ' : ' · ';
      return { html: `<p>${cells.map((c) => c.html).join(sep)}</p>`, text: cells.map((c) => c.text).join(sep) };
    });
    return { html: out.map((l) => l.html).join(''), text: out.map((l) => l.text).join('\n') };
  }

  const header = nonEmpty[0].map((c) => c.text);
  const body = nonEmpty.slice(1);
  const lines: { html: string; text: string }[] = [];

  const compact = body.every((r) => r.slice(1).every((c) => c.text.length <= 25));

  if (compact) {
    lines.push({
      html: `<p><strong>${header.map(esc).filter(Boolean).join(' · ')}</strong></p>`,
      text: header.filter(Boolean).join(' · '),
    });
    for (const r of body) {
      const label = r[0]?.text ?? '';
      const vals = r.slice(1).map((c, i) => ({ h: header[i + 1] ?? '', c }));
      const html = vals.map(({ h, c }) => (h ? `${esc(h)}: ` : '') + (c.html || '–')).join(' · ');
      const text = vals.map(({ h, c }) => (h ? `${h}: ` : '') + (c.text || '–')).join(' · ');
      lines.push({
        html: `<p>${label ? `<strong>${esc(label)}:</strong> ` : ''}${html}</p>`,
        text: label ? `${label}: ${text}` : text,
      });
    }
    return { html: lines.map((l) => l.html).join(''), text: lines.map((l) => l.text).join('\n') };
  }

  body.forEach((r, ri) => {
    if (ri > 0) lines.push(BLANK);
    let start = 0;
    if (r[0] && r[0].text.length <= 6 && r.length > 1) {
      const title = `${header[0] ?? ''} ${r[0].text}`.trim();
      lines.push({ html: `<p><strong><u>${esc(title)}</u></strong></p>`, text: title });
      start = 1;
    }
    for (let i = start; i < r.length; i++) {
      const h = header[i] ?? '';
      const c = r[i];
      if (!c.text && !h) continue;
      lines.push({
        html: `<p>${h ? `<strong>${esc(h)}:</strong> ` : ''}${c.html || '–'}</p>`,
        text: `${h ? `${h}: ` : ''}${c.text || '–'}`,
      });
    }
  });
  return { html: lines.map((l) => l.html).join(''), text: lines.map((l) => l.text).join('\n') };
}

// ---------- Felder aus den Formular-Tabellen ----------

const norm = (s: string) => s.replace(/[:*?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Bekannte Beschriftungen – damit wir nie eine Beschriftung als Wert übernehmen
const KNOWN_LABELS = [
  'mandant', 'stichtag', 'ap referenz', 'wb-nummer', 'betreff', 'ticket', 'sap', 'dpp bearbeiter',
  'dpp reviewer', 'engagement manager', 'engagement partner', 'konzernzugehörigkeit', 'kapitalmarkt',
  'berichtskritiker', 'zweitunterschrift',
];
const isLabel = (s: string | undefined) => {
  const v = (s ?? '').trim();
  if (!v) return false;
  if (/:\s*$/.test(v)) return true;
  const n = norm(v);
  return KNOWN_LABELS.some((l) => n === l || n.startsWith(`${l} `) || n.startsWith(`${l}/`) || n.startsWith(`${l}-`));
};
const cleanValue = (s: string | undefined) => {
  const v = (s ?? '').trim();
  return /^\[.*\]$/.test(v) || isLabel(v) ? '' : v;
};

type Grid = string[][];

// Sucht eine Beschriftung und nimmt den Wert rechts daneben – oder darunter,
// wenn rechts nur eine weitere Beschriftung steht (z. B. Kopfzeile „Mandant | Stichtag“).
function findCell(grids: Grid[], match: (cell: string) => boolean): string {
  for (const rows of grids) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (!match(norm(rows[r][c]))) continue;
        const right = cleanValue(rows[r][c + 1]);
        if (right) return right;
        const below = cleanValue(rows[r + 1]?.[c]);
        if (below) return below;
      }
    }
  }
  return '';
}

const byLabel = (grids: Grid[], label: string) =>
  findCell(grids, (cell) => cell === label || (cell.startsWith(label) && cell.length < label.length + 20));

// „Ticket-Nummer / SAP-Nummer“ oder „WB-Nummer/Ticket-Nummer“ → richtige Nummer anhand der Reihenfolge
function findTicket(grids: Grid[]): { ticketNr: string; otherNr: string } {
  for (const rows of grids) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const label = norm(rows[r][c]);
        if (!label.includes('ticket') || label.length > 60) continue;
        const nums = (rows[r][c + 1] ?? '').match(/\d{4,}/g) ?? [];
        if (!nums.length) continue;
        const parts = label.split('/');
        const idx = Math.max(0, parts.findIndex((p) => p.includes('ticket')));
        return { ticketNr: nums[idx] ?? nums[0], otherNr: nums.find((_, i) => i !== idx) ?? '' };
      }
    }
  }
  return { ticketNr: '', otherNr: '' };
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
  const grids: Grid[] = topTables.map((tbl) => kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map(textOf)));

  let { ticketNr, otherNr } = findTicket(grids);
  if (!ticketNr) {
    const m = textOf(body).match(/Ticket[- ]?(?:Nummer|Nr\.?)[^0-9]{0,40}(\d{5,})/i);
    ticketNr = m?.[1] ?? '';
  }

  // PIRB-Freigabeformular erkennen (Titel, Kopfzeile oder „Antwort des DPP (PIRB)“)
  let headerText = '';
  for (const name of Object.keys(zip.files)) {
    if (/^word\/header\d*\.xml$/.test(name)) headerText += await zip.files[name].async('string');
  }
  const allText = `${textOf(body)} ${headerText.replace(/<[^>]+>/g, ' ')}`;
  const formType: DocxData['formType'] = /PIRB[\s–-]*Freigabe|\(PIRB\)/i.test(allText) ? 'pirb' : 'hotline';

  const fields = {
    ticketNr,
    sapNr: otherNr,
    mandant: byLabel(grids, 'mandant'),
    stichtag: byLabel(grids, 'stichtag') || byLabel(grids, 'bilanzstichtag'),
    betreff: byLabel(grids, 'betreff'),
    bearbeiter: byLabel(grids, 'dpp bearbeiter'),
    reviewer: byLabel(grids, 'dpp reviewer'),
    engManager: byLabel(grids, 'engagement manager'),
    engPartner: byLabel(grids, 'engagement partner'),
    formType,
  };

  let stichworte = '';
  let imageCount = 0;
  let tableCount = 0;

  const render = (mode: TableMode) => {
    const blocks: { html: string; text: string }[] = [];
    const placeholder = `[Grafik einsehbar unter Ticket Nr. ${ticketNr || 'XXXXX'}]`;
    let skipping = false;
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

      // Kopf-Tabellen mit Stammdaten → nur Felder, nicht in den Text
      if (allCells.includes('mandant') || allCells.includes('engagement manager')) continue;

      if (cols === 1) {
        for (const tr of rows) {
          for (const tc of kids(tr, 'tc')) {
            const paras = kids(tc).filter((k) => k.localName === 'p' || k.localName === 'tbl');
            const nonEmpty = paras.filter((k) => k.localName === 'tbl' || !renderParagraph(k).empty);
            const only = nonEmpty.length === 1 && nonEmpty[0].localName === 'p' ? renderParagraph(nonEmpty[0]) : null;
            if (only && (only.heading || /^antwort des dpp/i.test(only.text)) && only.text.length < 120) setHeading(only.text);
            else addContent(tc);
          }
        }
        flushList();
        continue;
      }

      // Mehrspaltige Formular-Tabelle (Betreff …) → „Label: Wert“
      flushList();
      skipping = false;
      for (const tr of rows) {
        const cells = kids(tr, 'tc').map(cellContent);
        if (cells.filter((c) => c.text).length < 2) continue;
        // Ticket-Nr., DPP Bearbeiter/Reviewer und Unterlagen-Liste gehören nicht in „Anfrage / Antwort“
        if (/^(WB-Nummer|Ticket|DPP Bearbeiter|DPP Reviewer|Einzureichende)/i.test(cells[0].text.trim())) continue;
        const [label, ...rest] = cells;
        const lbl = label.html.replace(/:\s*(<\/strong>)?\s*$/, '$1');
        blocks.push({
          html: `<p><strong>${lbl}:</strong> ${rest.map((c) => c.html).join(' ')}</p>`,
          text: `${label.text.replace(/:\s*$/, '')}: ${rest.map((c) => c.text).join(' ')}`,
        });
      }
    }
    flushList();

    return {
      html: blocks.map((b) => b.html).join('<p><br></p>'),
      text: blocks.map((b) => b.text).join('\n\n'),
    };
  };

  render('table');

  return { ...fields, stichworte: stichworte.trim(), imageCount, tableCount, render };
}
