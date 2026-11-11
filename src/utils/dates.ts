// Data YYYY-MM-DD nel fuso locale. toISOString usa UTC e di notte può dare il giorno precedente.
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Giorno della settimana per esteso e data corta (es. "martedì 21/11"), dalla data YYYY-MM-DD nel fuso locale
export function formatDayAndDate(dateString: string, locale: string): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(locale, { weekday: 'long' });
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${weekday} ${dd}/${mm}`;
}
