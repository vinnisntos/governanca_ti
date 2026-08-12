// Arquitetura alinhada com as diretrizes do ADR Master.
//
// file.type vem do metadata do File/Blob informado pelo client (facilmente
// falsificável — ex.: new Blob([conteudoArbitrario], { type: "image/png" })).
// Esta função inspeciona os primeiros bytes do arquivo (magic bytes) para
// confirmar o tipo real, em vez de confiar apenas no MIME declarado.
export type AllowedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export async function sniffImageMimeType(
  file: File
): Promise<AllowedImageMimeType | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}
