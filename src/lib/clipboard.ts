// Kopiert Text in die Zwischenablage – auf Wunsch MIT Formatierung (HTML),
// damit fett, Absätze und Tabellen beim Einfügen erhalten bleiben.

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyRich(html: string, text: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const wrapped = `<div style="font-family:Arial,sans-serif;font-size:11pt;">${html}</div>`;
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
    return;
  }
  await copyText(text);
}
