import type { AnalysisResult, CaseType, FieldInfo, ReplySuggestion } from '../types';

interface FieldDef {
  label: string;
  patterns: string[];
  source: string;
}

// Felder für den Hotline-Archiv-Eintrag (laut Arbeitsanweisung)
const FIELDS: FieldDef[] = [
  { label: 'Clearance Date', patterns: ['Clearance Date', 'Freigabedatum', 'Gesendet', 'Sent', 'Datum'], source: 'Sendedatum der Clearance-Mail' },
  { label: 'Mandant', patterns: ['Mandant', 'Client'], source: 'Ticket Manager' },
  { label: 'Engagement Partner', patterns: ['Engagement Partner'], source: 'Ticket Manager' },
  { label: 'Engagement Manager', patterns: ['Engagement Manager'], source: 'Ticket Manager' },
  { label: 'Relevante Norm', patterns: ['Relevante Norm', 'Norm'], source: 'Ticket Manager (Spalte „Relevante Norm“)' },
  { label: 'Partner / Reviewer', patterns: ['Partner / Reviewer', 'Partner/Reviewer', 'Reviewer'], source: 'Ticket Manager' },
  { label: 'Manager / Preparer', patterns: ['Manager / Preparer', 'Manager/Preparer', 'Preparer'], source: 'Ticket Manager' },
  { label: 'Bilanzstichtag', patterns: ['Bilanzstichtag', 'Stichtag'], source: 'Ticket Manager oder Word-Dokument' },
  { label: 'Stichworte', patterns: ['Stichworte', 'Keywords'], source: 'Ende des Antwortdokuments (Word)' },
];

// Diese Normen werden NICHT ins Hotline-Archiv übertragen
const EXCLUDED_NORMS = [
  { label: 'PIRB', pattern: /\bPIRB\b/i },
  { label: 'PIR', pattern: /\bPIR\b/i },
  { label: 'Fehlerkorrektur/Bilanzberichtigung', pattern: /fehlerkorrektur|bilanzberichtigung/i },
  { label: 'Going Concern', pattern: /going[\s-]?concern/i },
];

export const SAMPLE_MAIL = `Von: DPP Ticket Manager
Gesendet: Montag, 12. Oktober 2026 09:14
Betreff: Clearance erteilt – Ticket Nr. 48213

Hallo zusammen,

das Ticket wurde abgeschlossen und freigegeben.

Mandant: Musterfirma GmbH
Relevante Norm: HGB § 285
Engagement Partner: Max Mustermann
Bilanzstichtag: 31.12.2025

Viele Grüße
DPP`;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findLabeledValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`^[\\t >*•-]*${escapeRegex(label)}\\s*[:：]\\s*(.+)$`, 'im');
    const match = text.match(re);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

export function extractTicketNumber(text: string): string | null {
  const patterns = [
    /Ticket[\s-]*(?:Nr\.?|Nummer|No\.?|ID|#)?\s*[:#]?\s*([A-Z]{0,4}-?\d{3,})/i,
    /\b((?:SR|REQ|DPP)-?\d{3,})\b/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export function hashText(text: string): string {
  let h = 0;
  for (const ch of text.trim()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return String(h);
}

export function analyzeMail(text: string, history: Record<string, string>): AnalysisResult {
  const ticketNumber = extractTicketNumber(text);
  const t = ticketNumber ?? 'XXXXX';

  const present: FieldInfo[] = [];
  const missingAll: FieldInfo[] = [];

  if (ticketNumber) present.push({ label: 'Ticket Nr.', value: ticketNumber, source: 'Mail' });
  else missingAll.push({ label: 'Ticket Nr.', source: 'Betreff der Clearance-Mail' });

  let norm: string | undefined;
  for (const field of FIELDS) {
    const value = findLabeledValue(text, field.patterns);
    if (field.label === 'Relevante Norm') norm = value;
    if (value) present.push({ label: field.label, value, source: 'Mail' });
    else missingAll.push({ label: field.label, source: field.source });
  }

  const excluded = EXCLUDED_NORMS.find((n) => n.pattern.test(norm ?? text));
  const inProgress = /in bearbeitung|noch offen|nicht abgeschlossen|entwurf/i.test(text);
  const seenBefore = ticketNumber ? history[ticketNumber] : undefined;
  const isDuplicate =
    (seenBefore !== undefined && seenBefore !== hashText(text)) || /doppelt|duplikat/i.test(text);

  let caseType: CaseType;
  let steps: string[];
  let reply: ReplySuggestion;
  let missing = missingAll;

  if (!ticketNumber) {
    caseType = {
      key: 'unklar',
      title: 'Unklar – keine Ticket-Nr.',
      description: 'In der Mail wurde keine Ticket-Nummer gefunden.',
      tone: 'info',
      reasons: ['Ohne Ticket-Nr. kann das Ticket im Ticket Manager nicht gefunden werden.'],
    };
    steps = [
      'Betreff der Mail nochmal genau auf eine Ticket-Nr. prüfen.',
      'Falls du den kompletten Mailtext eingefügt hast und trotzdem keine Nr. da ist: beim zuständigen DPP-Ansprechpartner nachfragen.',
      'Mail so lange nicht abhaken.',
    ];
    reply = {
      needed: true,
      note: 'Rückfrage an den Absender bzw. DPP-Ansprechpartner',
      text: `Hallo [Name],\n\nim Clearance-Postfach ist eine Mail eingegangen, in der ich keine Ticket-Nummer finde (Betreff: „[Betreff]“). Kannst du mir kurz sagen, um welches Ticket es geht?\n\nVielen Dank und viele Grüße\n[Dein Name]`,
    };
  } else if (inProgress) {
    caseType = {
      key: 'in-bearbeitung',
      title: 'Ticket noch in Bearbeitung',
      description: 'Das Ticket scheint noch nicht abgeschlossen zu sein.',
      tone: 'warning',
      reasons: ['Die Mail enthält Hinweise wie „in Bearbeitung“ oder „nicht abgeschlossen“.'],
    };
    missing = [];
    steps = [
      `Ticket Nr. ${t} im DPP Ticket Manager (Reiter „Alle Tickets“) suchen.`,
      'Status prüfen: Ist es NICHT als „Abgeschlossen“ gekennzeichnet → Mail zunächst ignorieren.',
      'Mail NICHT abhaken, später erneut prüfen.',
    ];
    reply = {
      needed: false,
      note: 'Normalerweise keine Antwort nötig. Optional, falls es länger offen bleibt:',
      text: `Hallo [Name],\n\nzum Ticket Nr. ${t} ist eine Clearance-Mail eingegangen, im Ticket Manager ist es aber noch nicht abgeschlossen. Soll ich mit der Übernahme ins Hotline-Archiv warten?\n\nViele Grüße\n[Dein Name]`,
    };
  } else if (excluded) {
    caseType = {
      key: 'nicht-archivieren',
      title: 'Nicht archivieren',
      description: `Relevante Norm: ${excluded.label}. Diese Tickets werden nicht ins Hotline-Archiv übertragen.`,
      tone: 'danger',
      reasons: norm
        ? [`Feld „Relevante Norm“: ${norm}`]
        : [`„${excluded.label}“ nur im Fließtext gefunden – bitte im Ticket Manager bestätigen.`],
    };
    missing = [];
    steps = [
      `Ticket Nr. ${t} im Ticket Manager öffnen und Spalte „Relevante Norm“ bestätigen.`,
      'Ticket NICHT ins Hotline-Archiv übertragen.',
      'Mail in Outlook abhaken (grüner Haken) und als ungelesen markieren.',
      'Fertig – keine weiteren Schritte.',
    ];
    reply = { needed: false, note: 'Keine Antwort nötig.', text: '' };
  } else if (isDuplicate) {
    caseType = {
      key: 'doppelt',
      title: 'Mögliche Doppel-Mail',
      description: 'Zu diesem Ticket wurde schon einmal eine (andere) Clearance-Mail analysiert.',
      tone: 'warning',
      reasons: ['Ticket-Nr. ist bereits im lokalen Verlauf oder die Mail erwähnt „doppelt“.'],
    };
    steps = [
      `Im Hotline-Archiv über die Suchleiste prüfen, ob Ticket Nr. ${t} schon existiert.`,
      'Den zuständigen DPP-Bearbeiter kurz nach dem Grund für die Doppel-Sendung fragen.',
      'Ticket nur EINMAL ins Hotline-Archiv übernehmen.',
      'Beide Mails in Outlook mit grünem Haken als erledigt markieren.',
    ];
    reply = {
      needed: true,
      note: 'Kurze Rückfrage an den DPP-Bearbeiter',
      text: `Hallo [Name],\n\nim Clearance-Postfach sind zum Ticket Nr. ${t} zwei Clearance-Mails eingegangen. Kannst du mir kurz sagen, woran das liegt? Ich übernehme das Ticket dann nur einmal ins Hotline-Archiv.\n\nVielen Dank und viele Grüße\n[Dein Name]`,
    };
  } else {
    caseType = {
      key: 'archivieren',
      title: 'Ins Hotline-Archiv übertragen',
      description: 'Keine Ausschluss-Norm gefunden – das Ticket wird archiviert.',
      tone: 'success',
      reasons: norm ? [`Relevante Norm: ${norm}`] : ['Norm nicht in der Mail – im Ticket Manager prüfen.'],
    };
    steps = [
      `Ticket Nr. ${t} im DPP Ticket Manager (Reiter „Alle Tickets“) suchen.`,
      'Prüfen, ob das Ticket als „Abgeschlossen“ markiert ist – sonst Mail ignorieren.',
      'Spalte „Relevante Norm“ prüfen (PIR, PIRB, Fehlerkorrektur/Bilanzberichtigung, Going Concern → nicht archivieren).',
      'Ticket per Doppelklick öffnen, ggf. Unabhängigkeitserklärung abgeben.',
      'Hotline-Archiv öffnen (Reiter „Zur Übersicht 2024 – dato“) → „Neuer Eintrag“.',
      'Alle Felder ausfüllen – fehlende Infos siehe Karte „Fehlende Informationen“.',
      'Antwortdokument (Word) kopieren und in „Anfrage / Antwort“ einfügen – OHNE Stichworte.',
      `Eingebettete Dokumente/Grafiken: Verweis „[Dokument einsehbar unter Ticket Nr. ${t}]“ einfügen.`,
      'Speichern – rote Hinweise korrigieren, bis es klappt.',
      'Mail in Outlook mit grünem Haken als erledigt markieren.',
    ];
    reply = {
      needed: false,
      note: 'Keine Antwort nötig. Hier der Text fürs Archiv-Feld „Titel“:',
      text: `Ticket Nr. ${t}`,
    };
  }

  return { caseType, ticketNumber, present, missing, steps, reply };
}