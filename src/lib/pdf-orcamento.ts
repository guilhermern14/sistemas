import { jsPDF } from "jspdf";
import { EMPRESA } from "./empresa";
import { formatMoney } from "./servico";
import { urlFoto } from "./fotos";
import { enderecoCompleto, type ClienteResumo, type Servico, type ServicoProduto, type ServicoFoto } from "./types";

const dataBR = (d: Date) => d.toLocaleDateString("pt-BR");

async function carregarImagemBase64(url: string): Promise<{ data: string; width: number; height: number } | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) {
    return { data: url, width: 800, height: 600 };
  }
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve({ data: reader.result, width: 800, height: 600 });
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch {}

  // Fallback via Image element
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 800;
        canvas.height = img.naturalHeight || img.height || 600;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const data = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ data, width: canvas.width, height: canvas.height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Gera e faz download direto do arquivo PDF do orçamento do serviço. */
export async function gerarOrcamentoPdf(
  servico: Servico,
  produtos: ServicoProduto[],
  fotos: ServicoFoto[] = [],
): Promise<boolean> {
  try {
    const hoje = new Date();
    const dataDocumento = servico.concluido_em ? new Date(servico.concluido_em) : hoje;
    const validade = new Date(hoje.getTime() + EMPRESA.validadeDias * 86400000);
    const cliente = servico.clientes as ClienteResumo | null | undefined;
    const nomeCliente = cliente?.nome?.trim() || "Cliente";
    const dataArquivo = dataDocumento.toLocaleDateString("pt-BR").replace(/\//g, "-");
    const nomeArquivo = `${dataArquivo} - ${nomeCliente} - Nascimento Sistemas de Seguranca`.replace(/[\\/:*?"<>|]/g, "-");

    const totalProdutos = produtos.reduce(
      (s, p) => s + Number(p.quantidade) * Number(p.valor_unitario),
      0,
    );
    const maoObra = Number(servico.valor_mao_obra ?? 0);
    const bruto = totalProdutos + maoObra;
    const desconto = Number(servico.desconto ?? 0);
    const total = servico.valor != null ? Number(servico.valor) : bruto - desconto;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 18;

    // --- Header ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 78, 216); // Blue #1d4ed8
    doc.text(EMPRESA.nome, margin, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`CNPJ: ${EMPRESA.cnpj}  |  Telefone: ${EMPRESA.telefone}`, margin, y);

    y += 4;
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);

    // --- Info bloco ---
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const numPed = String(servico.numero_pedido ?? 0).padStart(6, "0");
    doc.setFont("helvetica", "bold");
    doc.text(`Pedido nº: ${numPed}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Data do serviço: ${dataBR(dataDocumento)}`, margin + 60, y);
    doc.text(`Válido até: ${dataBR(validade)} (${EMPRESA.validadeDias} dias)`, margin + 120, y);

    // --- Cliente ---
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 78, 216);
    doc.text("CLIENTE", margin, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Nome: ${cliente?.nome ?? "—"}`, margin, y);
    if (cliente?.telefone) {
      doc.text(`Telefone: ${cliente.telefone}`, margin + 90, y);
    }
    y += 4.5;
    const end = enderecoCompleto(cliente);
    if (end) {
      doc.text(`Endereço: ${end}`, margin, y);
      y += 4.5;
    }

    // --- Serviço Executado ---
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 78, 216);
    doc.text("SERVIÇO EXECUTADO", margin, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const descText = servico.relatorio || servico.descricao || "—";
    const splitDesc = doc.splitTextToSize(descText, pageWidth - margin * 2);
    doc.text(splitDesc, margin, y);
    y += splitDesc.length * 4.5 + 2;

    // --- Tabela Produtos ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 78, 216);
    doc.text("PRODUTOS UTILIZADOS", margin, y);
    y += 4;

    // Header da tabela
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("CÓDIGO", margin + 2, y + 4.5);
    doc.text("PRODUTO", margin + 28, y + 4.5);
    doc.text("QTD", margin + 110, y + 4.5, { align: "center" });
    doc.text("UNITÁRIO", margin + 140, y + 4.5, { align: "right" });
    doc.text("TOTAL", pageWidth - margin - 2, y + 4.5, { align: "right" });
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);

    if (produtos.length === 0) {
      doc.text("Nenhum produto utilizado.", margin + 2, y + 5);
      y += 8;
    } else {
      for (const p of produtos) {
        if (y > 250) {
          doc.addPage();
          y = 18;
        }
        const cod = p.codigo || "—";
        const nome = doc.splitTextToSize(p.produto || "", 78);
        const qtd = String(Number(p.quantidade || 0));
        const unit = formatMoney(Number(p.valor_unitario || 0));
        const subTot = formatMoney(Number(p.quantidade || 0) * Number(p.valor_unitario || 0));

        doc.text(cod, margin + 2, y + 4);
        doc.text(nome, margin + 28, y + 4);
        doc.text(qtd, margin + 110, y + 4, { align: "center" });
        doc.text(unit, margin + 140, y + 4, { align: "right" });
        doc.text(subTot, pageWidth - margin - 2, y + 4, { align: "right" });

        const rowH = Math.max(nome.length * 4.5, 6);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, y + rowH, pageWidth - margin, y + rowH);
        y += rowH;
      }
    }

    // --- Totais ---
    y += 4;
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    const totBoxX = pageWidth - margin - 75;
    doc.setFontSize(9);
    doc.text("Produtos:", totBoxX, y);
    doc.text(formatMoney(totalProdutos), pageWidth - margin - 2, y, { align: "right" });
    y += 4.5;

    doc.text("Mão de obra:", totBoxX, y);
    doc.text(formatMoney(maoObra), pageWidth - margin - 2, y, { align: "right" });
    y += 4.5;

    if (desconto > 0) {
      doc.text("Desconto:", totBoxX, y);
      doc.text(`- ${formatMoney(desconto)}`, pageWidth - margin - 2, y, { align: "right" });
      y += 4.5;
    }

    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.5);
    doc.line(totBoxX, y, pageWidth - margin, y);
    y += 4.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 78, 216);
    doc.text("TOTAL:", totBoxX, y);
    doc.text(formatMoney(total), pageWidth - margin - 2, y, { align: "right" });

    // --- Rodapé Página 1 ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${EMPRESA.nome} · CNPJ ${EMPRESA.cnpj} · ${EMPRESA.telefone}`,
      pageWidth / 2,
      285,
      { align: "center" },
    );

    // --- Página 2: Fotos ---
    const fotosResolvidas: string[] = [];
    for (const f of fotos) {
      if (f.storage_path) {
        try {
          const fresh = await urlFoto(f.storage_path, f.url);
          if (fresh) fotosResolvidas.push(fresh);
          else if (f.url) fotosResolvidas.push(f.url);
        } catch {
          if (f.url) fotosResolvidas.push(f.url);
        }
      } else if (f.url) {
        fotosResolvidas.push(f.url);
      }
    }

    if (fotosResolvidas.length > 0) {
      doc.addPage();
      let fy = 18;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(29, 78, 216);
      doc.text("FOTOS DO SERVIÇO EXECUTADO", margin, fy);

      fy += 4;
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.5);
      doc.line(margin, fy, pageWidth - margin, fy);
      fy += 8;

      const colWidth = 85;
      const colHeight = 60;
      let col = 0;

      for (let i = 0; i < fotosResolvidas.length; i++) {
        const fotoUrl = fotosResolvidas[i];
        const imgData = await carregarImagemBase64(fotoUrl);

        if (fy + colHeight > 270) {
          doc.addPage();
          fy = 18;
          col = 0;
        }

        const posX = margin + col * (colWidth + 10);
        const posY = fy;

        if (imgData) {
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.rect(posX, posY, colWidth, colHeight);
          doc.addImage(imgData.data, "JPEG", posX + 1, posY + 1, colWidth - 2, colHeight - 2, undefined, "FAST");
        } else {
          doc.setFillColor(248, 250, 252);
          doc.rect(posX, posY, colWidth, colHeight, "F");
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(`Foto ${i + 1}`, posX + colWidth / 2, posY + colHeight / 2, { align: "center" });
        }

        if (col === 1) {
          col = 0;
          fy += colHeight + 8;
        } else {
          col = 1;
        }
      }

      // Rodapé Página 2
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${EMPRESA.nome} · CNPJ ${EMPRESA.cnpj} · ${EMPRESA.telefone}`,
        pageWidth / 2,
        285,
        { align: "center" },
      );
    }

    doc.save(`${nomeArquivo}.pdf`);
    return true;
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    return false;
  }
}
