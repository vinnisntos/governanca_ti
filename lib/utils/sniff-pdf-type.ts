// Mesmo raciocínio de lib/utils/sniff-image-type.ts: file.type vem do
// metadata do File/Blob informado pelo client (facilmente falsificável) —
// esta função confere a assinatura binária real (%PDF-) em vez de confiar
// só no MIME declarado.
export async function isPdfFile(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  // 0x25 0x50 0x44 0x46 0x2D == "%PDF-"
  return (
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  );
}
