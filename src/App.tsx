import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, CircleCheck, FileText, ImagePlus, LoaderCircle, RotateCcw, Sparkles, Table2, TriangleAlert, Type, X,
} from 'lucide-react';
import ThemeToggle from './components/ThemeToggle';
import DropZone from './components/DropZone';
import FieldRow from './components/FieldRow';
import CopyButton from './components/CopyButton';
import { parseDocx } from './lib/docx';
import type { DocxData, TableMode } from './lib/docx';
import { EXCLUDED, ocrImage, parseTicketText } from './lib/ocr';
import { copyRich } from './lib/clipboard';

interface Shot {
  id: string;
  url: string;
  progress: number;
  text?: string;
  error?: string;
}

type FieldKey =
  | 'title' | 'stichworte' | 'bilanzstichtag' | 'norm' | 'clearanceDate' | 'mandant'
  | 'partnerReviewer' | 'managerPreparer' | 'engManager' | 'engPartner' | 'ticketNr' | 'inquiryNr';

const today = () => new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const MODE_KEY = 'clearance-assistant:tableMode';
const BLOCK_MSG = '⛔ PIRB, PIR, Fehlerkorrektur/Bilanzberichtigung werden nicht ins Archiv übertragen!';

export default function App() {
  const [doc, setDoc] = useState<DocxData | null>(null);
  const [docName, setDocName] = useState('');
  const [docError, setDocError] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [edits, setEdits] = useState<Partial<Record<FieldKey, string>>>({});
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TableMode>(() => (localStorage.getItem(MODE_KEY) === 'text' ? 'text' : 'table'));

  useEffect(() => localStorage.setItem(MODE_KEY, mode), [mode]);

  // ---------- Word-Datei ----------
  const handleDoc = async (files: File[]) => {
    const file = files.find((f) => f.name.toLowerCase().endsWith('.docx'));
    if (!file) {
      setDocError('Bitte eine .docx-Datei auswählen.');
      return;
    }
    setDocLoading(true);
    setDocError('');
    try {
      setDoc(await parseDocx(file));
      setDocName(file.name);
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Word-Datei konnte nicht gelesen werden.');
    } finally {
      setDocLoading(false);
    }
  };

  // ---------- Screenshots ----------
  const addShots = useCallback((files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      const id = crypto.randomUUID();
      setShots((s) => [...s, { id, url: URL.createObjectURL(file), progress: 0 }]);
      ocrImage(file, (p) => setShots((s) => s.map((x) => (x.id === id ? { ...x, progress: p } : x))))
        .then((text) => setShots((s) => s.map((x) => (x.id === id ? { ...x, text, progress: 1 } : x))))
        .catch(() =>
          setShots((s) => s.map((x) => (x.id === id ? { ...x, error: 'Texterkennung fehlgeschlagen', progress: 1 } : x))),
        );
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        addShots(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addShots]);

  const ocrBusy = shots.some((s) => s.progress < 1);
  const ticket = useMemo(() => parseTicketText(shots.map((s) => s.text ?? '').join('\n')), [shots]);

  // ---------- Felder: Word hat Vorrang (zuverlässiger), sonst Screenshot ----------
  const auto: Record<FieldKey, string> = {
    title: doc?.ticketNr ? `Ticket Nr ${doc.ticketNr}` : '',
    stichworte: doc?.stichworte ?? '',
    bilanzstichtag: doc?.stichtag ?? '',
    norm: ticket.kategorie || (doc?.formType === 'pirb' ? 'PIRB' : ''),
    clearanceDate: ticket.clearanceDate || today(),
    mandant: doc?.mandant ?? '',
    partnerReviewer: doc?.reviewer ?? '',
    managerPreparer: doc?.bearbeiter ?? '',
    engManager: doc?.engManager || ticket.engagementManager,
    engPartner: doc?.engPartner || ticket.engagementPartner,
    ticketNr: doc?.ticketNr || ticket.ticketNr,
    inquiryNr: '',
  };
  const val = (k: FieldKey) => edits[k] ?? auto[k];
  const field = (k: FieldKey) => ({
    value: val(k),
    done: copied.has(k),
    onChange: (v: string) => setEdits((e) => ({ ...e, [k]: v })),
    onCopied: () => setCopied((c) => new Set(c).add(k)),
  });

  const body = useMemo(() => doc?.render(mode) ?? null, [doc, mode]);

  // ---------- Sperre + Warnungen ----------
  const normText = `${val('norm')} ${ticket.themengebiet}`.trim();
  const blocked = EXCLUDED.test(normText) || doc?.formType === 'pirb';
  useEffect(() => {
    if (blocked) window.alert(BLOCK_MSG);
  }, [blocked]);

  const warnings: { tone: 'red' | 'amber'; text: string }[] = [];
  if (blocked)
    warnings.push({
      tone: 'red',
      text: `${BLOCK_MSG} Erkannt: ${doc?.formType === 'pirb' ? 'PIRB-Freigabeformular' : `„${normText}“`} – Mail nur abhaken.`,
    });
  if (ticket.status === 'offen')
    warnings.push({ tone: 'amber', text: 'Ticket laut Screenshot nicht abgeschlossen – Clearance-Mail erstmal ignorieren.' });
  if (doc?.ticketNr && ticket.ticketNr && doc.ticketNr !== ticket.ticketNr)
    warnings.push({ tone: 'amber', text: `Ticket-Nr. passt nicht: Word ${doc.ticketNr}, Screenshot ${ticket.ticketNr}. Richtige Dateien?` });

  const reset = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setDoc(null);
    setDocName('');
    setDocError('');
    setShots([]);
    setEdits({});
    setCopied(new Set());
  };

  const required: FieldKey[] = ['title', 'stichworte', 'bilanzstichtag', 'norm', 'clearanceDate', 'mandant', 'partnerReviewer', 'managerPreparer', 'engManager', 'engPartner', 'ticketNr'];
  const filled = required.filter((k) => val(k).trim()).length;
  const src = (fromDoc: string, word: string, shot: string) => (fromDoc ? word : shot);

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-linear-to-r from-sky-400/30 via-violet-400/30 to-pink-400/30 blur-3xl dark:from-sky-500/20 dark:via-violet-500/20 dark:to-pink-500/20" />
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0d17]/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-sky-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight">Clearance Assistant</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Word + Screenshot → Hotline-Archiv</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <RotateCcw className="size-4" /> Neues Ticket
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <DropZone
            title="1. Word-Dokument"
            hint="Hotlineformular oder Freigabeformular – hierher ziehen oder klicken"
            accept=".docx"
            icon={FileText}
            onFiles={handleDoc}
          >
            {docLoading && <p className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Lese Word …</p>}
            {docError && <p className="text-sm text-rose-600 dark:text-rose-400">{docError}</p>}
            {doc && !docLoading && (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CircleCheck className="size-4 shrink-0" />
                <span className="truncate">
                  {docName} · {doc.formType === 'pirb' ? 'PIRB-Formular' : 'Hotlineformular'} · {doc.tableCount} Tabelle(n) · {doc.imageCount} Grafik(en)
                </span>
              </p>
            )}
          </DropZone>

          <DropZone
            title="2. Screenshots"
            hint="Strg + V · Ticket („Engagement Team“, „DPP Anfrage“) + Clearance-Mail"
            accept="image/*"
            multiple
            icon={ImagePlus}
            onFiles={addShots}
          >
            {shots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shots.map((s) => (
                  <div key={s.id} className="relative h-16 w-28 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                    <img src={s.url} alt="Screenshot" className="h-full w-full object-cover" />
                    {s.progress < 1 && (
                      <div className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-semibold text-white">
                        {Math.round(s.progress * 100)} %
                      </div>
                    )}
                    {s.error && <div className="absolute inset-0 grid place-items-center bg-rose-600/80 text-[10px] text-white">Fehler</div>}
                    <button
                      type="button"
                      onClick={() => setShots((all) => all.filter((x) => x.id !== s.id))}
                      className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white"
                      aria-label="Entfernen"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DropZone>
        </div>

        {warnings.map((w) => (
          <div
            key={w.text}
            className={`flex items-start gap-3 rounded-2xl p-4 text-sm font-medium ring-1 ring-inset ${
              w.tone === 'red'
                ? 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30'
                : 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30'
            }`}
          >
            {w.tone === 'red' ? <Ban className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
            {w.text}
          </div>
        ))}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-semibold">Archiv-Felder</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {ocrBusy && <LoaderCircle className="mr-1 inline size-3 animate-spin" />}
              {filled} / {required.length} ausgefüllt · {copied.size} kopiert
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FieldRow label="Title" source="automatisch" {...field('title')} />
            <FieldRow label="Stichwörter" source="Word · Stichworte" {...field('stichworte')} />
            <FieldRow label="Bilanzstichtag" source="Word · Stichtag" {...field('bilanzstichtag')} />
            <FieldRow label="Rechnungslegungsnorm" source="Screenshot · Relevante Kategorie" hint={ticket.themengebiet ? `Themengebiet: ${ticket.themengebiet}` : undefined} {...field('norm')} />
            <FieldRow label="Clearance Date" source={ticket.clearanceDate ? 'Screenshot · Mail-Datum' : 'heute – Mail-Screenshot einfügen oder ändern'} {...field('clearanceDate')} />
            <FieldRow label="Mandant" source="Word · Mandant" {...field('mandant')} />
            <FieldRow label="Partner / Reviewer" source="Word · DPP Reviewer" hint="Laut DPP-Organigramm kurz prüfen" {...field('partnerReviewer')} />
            <FieldRow label="Manager / Preparer" source="Word · DPP Bearbeiter" hint="Laut DPP-Organigramm kurz prüfen" {...field('managerPreparer')} />
            <FieldRow label="Engagement Manager" source={src(doc?.engManager ?? '', 'Word · Engagement Manager', 'Screenshot · Manager')} {...field('engManager')} />
            <FieldRow label="Engagement Partner" source={src(doc?.engPartner ?? '', 'Word · Engagement Partner', 'Screenshot · Partner')} {...field('engPartner')} />
            <FieldRow label="Ticket Nr" source={doc?.sapNr ? `Word · andere Nr. ${doc.sapNr}` : 'Word'} {...field('ticketNr')} />
            <FieldRow label="Inquiry Nr" source="optional" required={false} {...field('inquiryNr')} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Anfrage / Antwort</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ohne Stichworte · Grafiken → Verweis auf Ticket-Nr. · wird immer als Text eingefügt</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-slate-200 p-0.5 text-xs dark:border-white/10">
                {([['table', 'Tabelle', Table2], ['text', 'Text', Type]] as const).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${
                      mode === m ? 'bg-violet-100 font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'text-slate-500'
                    }`}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
              <CopyButton
                big
                label="Alles kopieren"
                disabled={!body || blocked}
                done={copied.has('body')}
                onCopy={async () => {
                  if (!doc) return;
                  const t = doc.render('text');
                  await copyRich(t.html, t.text);
                  setCopied((c) => new Set(c).add('body'));
                }}
              />
            </div>
          </div>
          {body ? (
            <div
              className="max-h-[520px] overflow-auto rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed dark:bg-black/30 [&_li]:my-0.5 [&_table]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: body.html }}
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-black/30 dark:text-slate-400">
              Word-Dokument oben einfügen – hier erscheint dann der fertige Text.
            </p>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500 sm:px-6 dark:text-slate-400">
        Läuft lokal im Browser – Word und Screenshots werden nicht hochgeladen.
      </footer>
    </div>
  );
}
