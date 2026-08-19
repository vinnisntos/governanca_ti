// eslint-disable-next-line no-misleading-character-class -- intencional: intervalo Unicode de marcas diacríticas combinantes (U+0300–U+036F)
const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLowerCase()
    .trim();
}

export function matchesSearch(term: string, ...fields: (string | null | undefined)[]): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return true;
  return fields.some((field) => normalizeText(field).includes(normalizedTerm));
}
