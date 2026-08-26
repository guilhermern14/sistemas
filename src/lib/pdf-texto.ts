/**
 * Extrai o texto estruturado de um PDF no navegador preservando a ordem horizontal
 * e o alinhamento de linhas de tabelas (usado para ler extratos bancários de qualquer banco).
 */
export async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const partesPaginas: string[] = [];

  type TextItemPos = {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type LineGroup = {
    y: number;
    items: TextItemPos[];
  };

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const rawItems: TextItemPos[] = [];

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      if (!str || str.trim().length === 0) continue;

      const transform = item.transform as number[]; // [scaleX, skewY, skewX, scaleY, x, y]
      const x = transform[4] ?? 0;
      const y = transform[5] ?? 0;
      const width = item.width ?? 0;
      const height = item.height ?? 10;

      rawItems.push({ str, x, y, width, height });
    }

    // Ordena do topo da página para o rodapé (Y decrescente)
    rawItems.sort((a, b) => b.y - a.y);

    // Agrupa itens em linhas com tolerância adaptativa de baseline vertical
    const lineGroups: LineGroup[] = [];
    const Y_TOLERANCE = 4.0; // pontos de tolerância para mesma linha de extrato

    for (const item of rawItems) {
      let matchedGroup = lineGroups.find(
        (g) => Math.abs(g.y - item.y) <= Math.max(Y_TOLERANCE, (item.height || 10) * 0.45),
      );

      if (matchedGroup) {
        matchedGroup.items.push(item);
        // Atualiza a posição média vertical da linha
        matchedGroup.y =
          (matchedGroup.y * (matchedGroup.items.length - 1) + item.y) / matchedGroup.items.length;
      } else {
        lineGroups.push({
          y: item.y,
          items: [item],
        });
      }
    }

    // Ordena as linhas do topo para o rodapé
    lineGroups.sort((a, b) => b.y - a.y);

    const linhasPagina: string[] = [];

    for (const group of lineGroups) {
      // Ordena os itens da linha estritamente da esquerda para a direita (X crescente)
      group.items.sort((a, b) => a.x - b.x);

      let linhaTexto = "";
      let lastEndX = -1;

      for (const it of group.items) {
        const text = it.str;
        if (!text) continue;

        if (lastEndX >= 0) {
          const gap = it.x - lastEndX;
          // Se houver espaçamento horizontal (> 2.0pt), insere espaço limpo
          if (gap > 2.0 && !linhaTexto.endsWith(" ") && !text.startsWith(" ")) {
            linhaTexto += " ";
          }
        }

        linhaTexto += text;
        lastEndX = it.x + (it.width || 0);
      }

      const trimLine = linhaTexto.trim();
      if (trimLine.length > 0) {
        linhasPagina.push(trimLine);
      }
    }

    if (linhasPagina.length > 0) {
      partesPaginas.push(linhasPagina.join("\n"));
    }
  }

  return partesPaginas.join("\n").slice(0, 150000);
}

