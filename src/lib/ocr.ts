import { createWorker } from 'tesseract.js';

// Liest Text aus Ticket-Screenshots (läuft komplett im Browser)
// und sucht darin Engagement Partner, Engagement Manager, Kategorie und Status.

export interface TicketData {
  ticketNr: string;
  engagementPartner: string;
  engagementManager: string;
  kategorie: string;
  themengebiet: string;
  status: 'abgeschlossen' | 'offen' | '';
}

// Screenshot vergrößern + in Graustufen umwandeln → bessere Texterkennung
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 2200 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.filter = 'grayscale(1) contrast(1.2)';
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

function findName(text: string, label: string): string {
  const re = new RegExp(String.raw`(?<![A-Za-zÄÖÜäöüß/])${label}\s*[:;.]?\s*\*?\s*[|\[(]?\s*${NAME}`);
  const [last, firstName] = (text.match(re)?.[1] ?? "").split(",").map((s) => s.trim());
  return firstName ? `${firstName} ${last}` : last;
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
  };
}
