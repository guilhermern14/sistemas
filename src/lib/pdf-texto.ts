/** Extrai o texto de um PDF no navegador (usado para ler extratos bancários). */
export async function extrairTextoPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const partes: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const linhas = new Map<number, string[]>();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round((item.transform[5] as number) / 3);
      const atual = linhas.get(y) ?? [];
      atual.push(item.str);
      linhas.set(y, atual);
    }
    const ordenadas = [...linhas.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v.join(" ").trim());
    partes.push(ordenadas.filter(Boolean).join("\n"));
  }

  return partes.join("\n").slice(0, 110000);
}
