import { createWorker } from 'tesseract.js';

// Liest Text aus Screenshots (Ticket + Clearance-Mail) – läuft komplett im Browser.

export interface TicketData {
  ticketNr: string;
  engagementPartner: string;
  engagementManager: string;
  kategorie: string;
  themengebiet: string;
  status: 'abgeschlossen' | 'offen' | '';
  clearanceDate: string;
}

// Screenshot vergrößern, in Graustufen umwandeln und bei dunklem Hintergrund
// (z. B. Outlook im Dark Mode) invertieren → bessere Texterkennung
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 2200 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');

  // Helligkeit grob messen
  const probe = document.createElement('canvas');
  probe.width = 64;
  probe.height = 64;
  const pctx = probe.getContext('2d');
  let dark = false;
  if (pctx) {
    pctx.drawImage(bitmap, 0, 0, 64, 64);
    const d = pctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    dark = sum / (d.length / 4) < 110;
  }

  ctx.filter = `grayscale(1) contrast(1.2)${dark ? ' invert(1)' : ''}`;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function ocrImage(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const canvas = await prepare(file);
  const worker = await createWorker('deu', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// Name im Format „Nachname, Vorname“ (auch „von Hoyningen-Huene, Constantin“)
const NAME = String.raw`((?:[A-Za-zÄÖÜäöüß'’.\-]+\s+){0,3}?[A-Za-zÄÖÜäöüß'’.\-]+,\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+)`;

// Gibt den Namen als „Vorname Nachname“ zurück
function findName(text: string, label: string): string {
  const re = new RegExp(String.raw`(?<![A-Za-zÄÖÜäöüß/])${label}\s*[:;.]?\s*\*?\s*[|\[(]?\s*${NAME}`);
  const [last, firstName] = (text.match(re)?.[1] ?? '').split(',').map((s) => s.trim());
  return firstName ? `${firstName} ${last}` : last;
}

// Datum der Clearance-Mail, z. B. „Mo 12.10.2026 10:07“
function findMailDate(text: string): string {
  const pad = (d: string, m: string, y: string) => `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  const withDay = text.match(/\b(?:Mo|Di|Mi|Do|Fr|Sa|So)[a-z]*\.?,?\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (withDay) return pad(withDay[1], withDay[2], withDay[3]);
  const withTime = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+\d{1,2}:\d{2}/);
  if (withTime) return pad(withTime[1], withTime[2], withTime[3]);
  return '';
}

export const EXCLUDED = /\bPIRB?\b|Fehlerkorrektur|Bilanzberichtigung|Going[\s-]*Concern/i;

export function parseTicketText(text: string): TicketData {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  let kategorie = '';
  let themengebiet = '';
  const idx = lines.findIndex((l) => /Relevante\s+Kategorie/i.test(l));
  if (idx >= 0) {
    const valueLine = lines.slice(idx + 1, idx + 4).find((l) => l.length > 1) ?? '';
    const parts = valueLine
      .split(/\s+[x×X✕]\s+|\s+[x×X✕]$|\s{2,}|\s[|]\s?/)
      .map((p) => p.replace(/^[^A-Za-zÄÖÜäöüß0-9]+|[^A-Za-zÄÖÜäöüß0-9)]+$/g, '').trim())
      .filter((p) => p.length > 1);
    kategorie = parts[0] ?? '';
    themengebiet = parts[1] ?? '';
  }

  const statusMatch = text.match(/Status\s*[:;]?\s*([A-Za-zÄÖÜäöüß]+)/i);
  const status: TicketData['status'] = statusMatch
    ? /^abgeschlo/i.test(statusMatch[1])
      ? 'abgeschlossen'
      : 'offen'
    : '';

  return {
    ticketNr: text.match(/Ticket[- ]?Nummer\s*[:#]?\s*(\d{5,})/i)?.[1] ?? '',
    engagementPartner: findName(text, 'Partner'),
    engagementManager: findName(text, 'Manager'),
    kategorie,
    themengebiet,
    status,
    clearanceDate: findMailDate(text),
  };
}
