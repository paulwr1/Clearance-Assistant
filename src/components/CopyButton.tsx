import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Zwischenablage blockiert - Text dann manuell markieren
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
      {copied ? 'Kopiert' : 'Kopieren'}
    </button>
  );
}
