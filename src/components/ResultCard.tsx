import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

const ACCENTS = {
  blue: 'from-sky-500 to-blue-600',
  emerald: 'from-emerald-500 to-teal-500',
  amber: 'from-amber-400 to-orange-500',
  violet: 'from-violet-500 to-fuchsia-500',
  pink: 'from-pink-500 to-rose-500',
} as const;

interface Props {
  title: string;
  icon: LucideIcon;
  accent: keyof typeof ACCENTS;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  delay?: number;
}

export default function ResultCard({ title, icon: Icon, accent, children, action, className = '', delay = 0 }: Props) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-fade-up rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid size-9 place-items-center rounded-xl bg-linear-to-br ${ACCENTS[accent]} text-white shadow-md`}>
            <Icon className="size-5" />
          </span>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
