import "server-only";
import { getGoogleAccessToken } from "./google-service-account";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch<T>(path: string): Promise<T> {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`${SHEETS_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Sheets API falhou (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

async function getFirstSheetTitle(spreadsheetId: string): Promise<string> {
  const data = await sheetsFetch<{ sheets?: { properties?: { title?: string } }[] }>(
    `/${spreadsheetId}?fields=sheets.properties.title`
  );
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) {
    throw new Error("Não foi possível identificar a primeira aba da planilha");
  }
  return title;
}

// UNFORMATTED_VALUE: números vêm como number puro (sem "R$"/separador de
// milhar) e datas como número de série do Sheets (dias desde 1899-12-30) —
// ambos comparáveis/parseáveis sem depender do locale de exibição da célula.
export async function fetchSheetRows(spreadsheetId: string): Promise<unknown[][]> {
  const title = await getFirstSheetTitle(spreadsheetId);
  const range = encodeURIComponent(`'${title}'!A1:F`);
  const data = await sheetsFetch<{ values?: unknown[][] }>(
    `/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`
  );
  return data.values ?? [];
}
