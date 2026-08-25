import { EMPRESA } from "./empresa";
import { formatMoney } from "./servico";
import { enderecoCompleto, type ClienteResumo, type Servico, type ServicoProduto, type ServicoFoto } from "./types";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

const dataBR = (d: Date) => d.toLocaleDateString("pt-BR");

/** Abre uma janela pronta para impressão / salvar em PDF do orçamento do serviço. */
export function gerarOrcamentoPdf(servico: Servico, produtos: ServicoProduto[], fotos: ServicoFoto[] = [], targetWindow?: Window | null) {
  const hoje = new Date();
  const dataDocumento = servico.concluido_em ? new Date(servico.concluido_em) : hoje;
  const validade = new Date(hoje.getTime() + EMPRESA.validadeDias * 86400000);
  const cliente = servico.clientes as ClienteResumo | null | undefined;
  const nomeCliente = cliente?.nome?.trim() || "Cliente";
  const dataArquivo = dataDocumento.toLocaleDateString("pt-BR").replace(/\//g, "-");
  const nomeArquivo = `${dataArquivo} - ${nomeCliente} - Nascimento Sistemas de Segurança`.replace(/[\\/:*?"<>|]/g, "-");

  const totalProdutos = produtos.reduce(
    (s, p) => s + Number(p.quantidade) * Number(p.valor_unitario),
    0,
  );
  const maoObra = Number(servico.valor_mao_obra ?? 0);
  const bruto = totalProdutos + maoObra;
  const desconto = Number(servico.desconto ?? 0);
  const total = servico.valor != null ? Number(servico.valor) : bruto - desconto;

  const linhas = produtos
    .map(
      (p) => `<tr>
        <td>${esc(p.codigo ?? "—")}</td>
        <td>${esc(p.produto)}</td>
        <td class="c">${Number(p.quantidade)}</td>
        <td class="r">${formatMoney(Number(p.valor_unitario))}</td>
        <td class="r">${formatMoney(Number(p.quantidade) * Number(p.valor_unitario))}</td>
      </tr>`,
    )
    .join("");

  const fotosValidas = fotos.filter((f) => f?.url).map((f) => f.url).filter(Boolean);
  const fotosHtml = fotosValidas.length > 0
    ? `<section class="page-break fotos-page"><h2>Fotos do serviço executado</h2><div class="fotos">${fotosValidas.map((url, i) => `<div class="foto"><img src="${esc(url)}" alt="Foto do serviço ${i + 1}"></div>`).join("")}</div></section>`
    : `<section class="page-break fotos-page"><h2>Fotos do serviço executado</h2><p class="sub">Nenhuma foto foi adicionada ao serviço.</p></section>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(nomeArquivo)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:32px;font-size:13px}
  h1{font-size:20px;margin:0} .sub{color:#475569;font-size:12px;line-height:1.5}
  header{border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:18px}
  h2{font-size:14px;margin:20px 0 8px;color:#1d4ed8}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#475569}
  .r{text-align:right} .c{text-align:center}
  .totais{margin-top:16px;margin-left:auto;width:280px}
  .totais div{display:flex;justify-content:space-between;padding:4px 0}
  .totais .final{border-top:2px solid #1d4ed8;font-weight:bold;font-size:15px;margin-top:6px;padding-top:8px}
  footer{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;color:#475569;font-size:11px}
  .page-break{break-before:page;page-break-before:always}
  .fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .foto{height:58mm;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;break-inside:avoid}
  .foto img{width:100%;height:100%;object-fit:contain}
  @media print{body{margin:12mm}.foto{height:58mm}}
</style></head><body>
<header>
  <h1>${esc(EMPRESA.nome)}</h1>
  <p class="sub">CNPJ ${esc(EMPRESA.cnpj)}<br>${esc(EMPRESA.telefone)}</p>
</header>

<p class="sub">
  <strong>Pedido nº:</strong> ${String(servico.numero_pedido ?? 0).padStart(6, "0")}<br>
  <strong>Data do serviço:</strong> ${dataBR(dataDocumento)}<br>
  <strong>Orçamento válido até:</strong> ${dataBR(validade)} (${EMPRESA.validadeDias} dias)
</p>

<h2>Cliente</h2>
<p class="sub">
  ${esc(cliente?.nome ?? "—")}<br>
  ${esc(cliente?.telefone ?? "")}<br>
  ${esc(enderecoCompleto(cliente))}
</p>

<h2>Serviço executado</h2>
<p class="sub">${esc(servico.relatorio || servico.descricao || "—")}</p>

<h2>Produtos utilizados</h2>
<table>
  <thead><tr><th>Código</th><th>Produto</th><th class="c">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr></thead>
  <tbody>${linhas || `<tr><td colspan="5">Nenhum produto utilizado.</td></tr>`}</tbody>
</table>

<div class="totais">
  <div><span>Produtos</span><span>${formatMoney(totalProdutos)}</span></div>
  <div><span>Mão de obra </span><span>${formatMoney(maoObra)}</span></div>
  ${desconto > 0 ? `<div><span>Desconto</span><span>- ${formatMoney(desconto)}</span></div>` : ""}
  <div class="final"><span>Total</span><span>${formatMoney(total)}</span></div>
</div>

${fotosHtml}

<footer>
  
  ${esc(EMPRESA.nome)} · CNPJ ${esc(EMPRESA.cnpj)} · ${esc(EMPRESA.telefone)}
<style>
  /* Remove o endereço IP e a rota do rodapé/cabeçalho */
  @page { 
    margin: 0; 
  }
  /* Mantém uma margem segura para o conteúdo não colar na borda do papel */
  body { 
    margin: 1.5cm; 
  }
</style>
</footer>
<script>
window.addEventListener('load', function () {
  const imgs = Array.from(document.images);
  const printNow = () => setTimeout(() => window.print(), 300);
  if (!imgs.length) return printNow();
  let remaining = imgs.length;
  const done = () => { remaining -= 1; if (remaining <= 0) printNow(); };
  imgs.forEach(img => {
    if (img.complete) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });
  setTimeout(printNow, 5000);
});
</script>
</body></html>`;

  // Cria um iframe oculto na página atual
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  
  document.body.appendChild(iframe);

  // Escreve o HTML dentro do iframe oculto
  const doc = iframe.contentWindow?.document;
  if (!doc) return false;
  doc.open();
  doc.write(html);
  doc.close();

  // Remove o iframe da tela após a impressão ser disparada
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);

  return true;
}
