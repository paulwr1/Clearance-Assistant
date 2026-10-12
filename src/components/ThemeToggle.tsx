import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const KEY = 'clearance-assistant:theme';

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label="Farbmodus wechseln"
      className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
    >
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
