const KEY = 'clearance-assistant:history';

export function loadHistory(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveToHistory(ticket: string, hash: string): void {
  const history = loadHistory();
  history[ticket] = hash;
  localStorage.setItem(KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}