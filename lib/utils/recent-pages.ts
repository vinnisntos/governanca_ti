export const RECENT_PAGES_STORAGE_KEY = "gti:recent-pages";
export const MAX_RECENT_PAGES = 4;

export function readRecentPages(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PAGES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((href) => typeof href === "string") : [];
  } catch {
    // localStorage indisponível (modo privado, cookies bloqueados etc.)
    return [];
  }
}
