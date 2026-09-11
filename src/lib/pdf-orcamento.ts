import { jsPDF } from "jspdf";
import { EMPRESA } from "./empresa";
import { formatMoney } from "./servico";
import { urlFoto } from "./fotos";
import { enderecoCompleto, type ClienteResumo, type Servico, type ServicoProduto, type ServicoFoto, type Orcamento, type OrcamentoItem } from "./types";

const dataBR = (d: Date) => d.toLocaleDateString("pt-BR");

async function carregarImagemBase64(rawUrl: string): Promise<{ data: string; width: number; height: number } | null> {
  if (!rawUrl) return null;
  // Normaliza caminhos duplicados se houver
  const url = rawUrl.replace(/\/storage\/v1\/storage\/v1\//g, "/storage/v1/");

  if (url.startsWith("data:image/")) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL("image/jpeg", 0.92), width: canvas.width, height: canvas.height });
        } else {
          resolve({ data: url, width: canvas.width, height: canvas.height });
        }
      };
      img.onerror = () => resolve({ data: url, width: 800, height: 600 });
      img.src = url;
    });
  }

  // 1. Tenta baixar via fetch blob e converter para Data URL JPEG
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const resImg = await new Promise<{ data: string; width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width || 800;
            canvas.height = img.naturalHeight || img.height || 600;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const jpegData = canvas.toDataURL("image/jpeg", 0.92);
              return resolve({ data: jpegData, width: canvas.width, height: canvas.height });
            }
          } catch {}
          resolve({ data: dataUrl, width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
        };
        img.onerror = () => {
          resolve({ data: dataUrl, width: 800, height: 600 });
        };
        img.src = dataUrl;
      });
      if (resImg) return resImg;
    }
  } catch (err) {
    console.warn("Tentando fallback de carregamento da imagem:", err);
  }

  // 2. Fallback via Image element com crossOrigin
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
        const data = canvas.toDataURL("image/jpeg", 0.92);
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
    const custoAdicional = Number(servico.custo_adicional ?? 0);
    const incluirCustoNoTotal = Boolean(servico.incluir_custo_no_total);
    const bruto = totalProdutos + maoObra + (incluirCustoNoTotal ? custoAdicional : 0);
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

    if (incluirCustoNoTotal && custoAdicional > 0) {
      const labelCusto = servico.descricao_custo_adicional
        ? `Despesas (${servico.descricao_custo_adicional}):`
        : "Deslocamento / Despesas:";
      doc.text(labelCusto, totBoxX, y);
      doc.text(formatMoney(custoAdicional), pageWidth - margin - 2, y, { align: "right" });
      y += 4.5;
    }

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
          doc.setFillColor(248, 250, 252);
          doc.rect(posX, posY, colWidth, colHeight, "F");
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.rect(posX, posY, colWidth, colHeight);

          // Ajusta tamanho mantendo proporção original
          const maxW = colWidth - 2;
          const maxH = colHeight - 2;
          const imgRatio = (imgData.width || 4) / (imgData.height || 3);
          let renderW = maxW;
          let renderH = maxW / imgRatio;

          if (renderH > maxH) {
            renderH = maxH;
            renderW = maxH * imgRatio;
          }

          const offX = posX + 1 + (maxW - renderW) / 2;
          const offY = posY + 1 + (maxH - renderH) / 2;

          doc.addImage(imgData.data, "JPEG", offX, offY, renderW, renderH, undefined, "FAST");
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

/**
 * Gera o PDF da Proposta Comercial / Orçamento para o cliente
 */
export async function gerarPropostaOrcamentoPdf(
  orcamento: Orcamento,
  itens: OrcamentoItem[]
): Promise<boolean> {
  try {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const cliente = orcamento.clientes;
    const nomeClienteSanitizado = (cliente?.nome ?? "cliente").replace(/[^a-zA-Z0-9_-]/g, "_");
    const numStr = String(orcamento.numero || "0").padStart(5, "0");
    const nomeArquivo = `Orcamento_${numStr}_${nomeClienteSanitizado}`;

    let y = 14;

    // --- CABEÇALHO EMPRESA ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(29, 78, 216); // Azul corporativo
    doc.text(EMPRESA.nome, margin, y + 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Câmeras, Alarme, Interfone, motor de portão e cerca elétrica", margin, y + 7);
    doc.text(`CNPJ: ${EMPRESA.cnpj} · Tel: ${EMPRESA.telefone}`, margin, y + 11.5);
    if (EMPRESA.email) {
      doc.text(`E-mail: ${EMPRESA.email}`, margin, y + 16);
    }

    // Badge / Título Direita
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(pageWidth - margin - 58, y - 2, 58, 18, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(29, 78, 216);
    doc.text("ORÇAMENTO COMERCIAL", pageWidth - margin - 29, y + 3.5, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Nº ${numStr}`, pageWidth - margin - 29, y + 9.5, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(orcamento.status === "aprovado" ? "STATUS: APROVADO" : "STATUS: PROPOSTA", pageWidth - margin - 29, y + 14, { align: "center" });

    y += 22;
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);

    // --- DATAS E PRAZOS ---
    y += 6;
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);

    const dataDoc = new Date(orcamento.data || orcamento.created_at || new Date());
    const validadeDias = orcamento.validade_dias || 15;
    const dataValidade = new Date(dataDoc);
    dataValidade.setDate(dataValidade.getDate() + validadeDias);

    doc.setFont("helvetica", "bold");
    doc.text(`Data de Emissão:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(dataBR(dataDoc), margin + 28, y);

    doc.setFont("helvetica", "bold");
    doc.text(`Validade da Proposta:`, margin + 65, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${dataBR(dataValidade)} (${validadeDias} dias)`, margin + 102, y);

    if (orcamento.forma_pagamento) {
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.text(`Condição de Pagamento:`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(orcamento.forma_pagamento, margin + 42, y);
    }

    // --- DADOS DO CLIENTE ---
    y += 8;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text("DADOS DO CLIENTE", margin + 4, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Cliente:", margin + 4, y + 10.5);
    doc.setFont("helvetica", "normal");
    doc.text(cliente?.nome ?? "Não informado", margin + 18, y + 10.5);

    if (cliente?.telefone) {
      doc.setFont("helvetica", "bold");
      doc.text("Telefone:", margin + 105, y + 10.5);
      doc.setFont("helvetica", "normal");
      doc.text(cliente.telefone, margin + 121, y + 10.5);
    }

    const end = enderecoCompleto(cliente);
    if (end) {
      doc.setFont("helvetica", "bold");
      doc.text("Endereço:", margin + 4, y + 16.5);
      doc.setFont("helvetica", "normal");
      doc.text(end, margin + 21, y + 16.5);
    }

    y += 26;

    // --- ESCOPO / DESCRIÇÃO DO SERVIÇO ---
    if (orcamento.descricao) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(29, 78, 216);
      doc.text("DESCRIÇÃO DOS SERVIÇOS E ESCOPO", margin, y);
      y += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      const splitDesc = doc.splitTextToSize(orcamento.descricao, pageWidth - margin * 2);
      doc.text(splitDesc, margin, y);
      y += splitDesc.length * 4.2 + 3;
    }

    // --- TABELA DE PRODUTOS / EQUIPAMENTOS ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text("EQUIPAMENTOS E MATERIAIS COTADOS", margin, y);
    y += 3.5;

    // Cabeçalho da tabela
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - margin * 2, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("CÓDIGO", margin + 3, y + 4.2);
    doc.text("PRODUTO / DISCRIMINAÇÃO", margin + 28, y + 4.2);
    doc.text("QTD", margin + 115, y + 4.2, { align: "center" });
    doc.text("UN", margin + 128, y + 4.2, { align: "center" });
    doc.text("VALOR UNIT.", margin + 155, y + 4.2, { align: "right" });
    doc.text("SUBTOTAL", pageWidth - margin - 3, y + 4.2, { align: "right" });
    y += 6.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    let totalProdutos = 0;

    if (itens.length === 0) {
      doc.text("Nenhum material/equipamento listado nesta proposta.", margin + 3, y + 4.5);
      y += 7;
    } else {
      for (const item of itens) {
        if (y > 240) {
          doc.addPage();
          y = 16;
        }

        const qtd = Number(item.quantidade || 0);
        const unit = Number(item.valor_venda || 0);
        const sub = qtd * unit;
        totalProdutos += sub;

        const cod = item.codigo || "—";
        const nomeLines = doc.splitTextToSize(item.produto || "Item", 82);
        const rowH = Math.max(nomeLines.length * 4, 5.5);

        doc.text(cod, margin + 3, y + 3.8);
        doc.text(nomeLines, margin + 28, y + 3.8);
        doc.text(String(qtd), margin + 115, y + 3.8, { align: "center" });
        doc.text(item.unidade || "UN", margin + 128, y + 3.8, { align: "center" });
        doc.text(formatMoney(unit), margin + 155, y + 3.8, { align: "right" });
        doc.text(formatMoney(sub), pageWidth - margin - 3, y + 3.8, { align: "right" });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, y + rowH, pageWidth - margin, y + rowH);
        y += rowH;
      }
    }

    // --- MÃO DE OBRA E TOTAIS ---
    y += 4;
    if (y > 230) {
      doc.addPage();
      y = 16;
    }

    const maoObra = Number(orcamento.valor_mao_obra || 0);
    const custoAdicional = Number(orcamento.custo_adicional || 0);
    const incluirCusto = Boolean(orcamento.incluir_custo_no_total);
    const desconto = Number(orcamento.desconto || 0);
    const totalGeral = Number(orcamento.valor_total || totalProdutos + maoObra - desconto);

    const totBoxW = 85;
    const totBoxX = pageWidth - margin - totBoxW;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(totBoxX - 4, y - 2, totBoxW + 4, 38, 1.5, 1.5, "FD");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);

    doc.text("Total Materiais / Produtos:", totBoxX, y + 3);
    doc.text(formatMoney(totalProdutos), pageWidth - margin - 2, y + 3, { align: "right" });

    doc.text(`Mão de Obra (${orcamento.horas_mao_obra || 0}h):`, totBoxX, y + 8);
    doc.text(formatMoney(maoObra), pageWidth - margin - 2, y + 8, { align: "right" });

    let currY = y + 13;
    if (custoAdicional > 0 && incluirCusto) {
      const lblCusto = orcamento.descricao_custo_adicional || "Despesas / Deslocamento";
      doc.text(`${lblCusto}:`, totBoxX, currY);
      doc.text(formatMoney(custoAdicional), pageWidth - margin - 2, currY, { align: "right" });
      currY += 5;
    }

    if (desconto > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text("Desconto Concedido:", totBoxX, currY);
      doc.text(`- ${formatMoney(desconto)}`, pageWidth - margin - 2, currY, { align: "right" });
      currY += 5;
    }

    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.4);
    doc.line(totBoxX, currY, pageWidth - margin, currY);

    currY += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 78, 216);
    doc.text("TOTAL DA PROPOSTA:", totBoxX, currY);
    doc.text(formatMoney(totalGeral), pageWidth - margin - 2, currY, { align: "right" });

    y += 42;

    // --- OBSERVAÇÕES E GARANTIA ---
    if (y > 235) {
      doc.addPage();
      y = 16;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(29, 78, 216);
    doc.text("INFORMAÇÕES ADICIONAIS E CONDIÇÕES DE GARANTIA", margin, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);

    const obsText =
      orcamento.observacoes ||
      "Garantia de 1 (um) ano contra defeitos de fabricação dos equipamentos. Garantia de 90 (noventa) dias para a mão de obra de instalação. O orçamento não contempla eventuais obras de alvenaria ou infraestrutura elétrica pesada não especificadas.";

    const splitObs = doc.splitTextToSize(obsText, pageWidth - margin * 2);
    doc.text(splitObs, margin, y);
    y += splitObs.length * 3.8 + 8;

    // --- ASSINATURAS ---
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    const colW = (pageWidth - margin * 2 - 20) / 2;
    const signY = Math.min(y + 16, pageHeight - 25);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(margin, signY, margin + colW, signY);
    doc.line(margin + colW + 20, signY, pageWidth - margin, signY);

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`${EMPRESA.nome}`, margin + colW / 2, signY + 4, { align: "center" });
    doc.text("Responsável Técnico / Comercial", margin + colW / 2, signY + 8, { align: "center" });

    doc.text(`Aceite do Cliente: ${cliente?.nome ?? "Cliente"}`, margin + colW + 20 + colW / 2, signY + 4, { align: "center" });
    doc.text("Data do Aceite: _____/_____/_________ ", margin + colW + 20 + colW / 2, signY + 8, { align: "center" });

    // Rodapé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${EMPRESA.nome} · CNPJ ${EMPRESA.cnpj} · ${EMPRESA.telefone} · ${EMPRESA.email || ""}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );

    doc.save(`${nomeArquivo}.pdf`);
    return true;
  } catch (err) {
    console.error("Erro ao gerar PDF do orçamento:", err);
    return false;
  }
}
