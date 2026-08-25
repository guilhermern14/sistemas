import type { ServicoStatus, ServicoTipo } from "./servico";

export type Cliente = {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  observacoes: string | null;
  created_at: string;
};

export type ClienteResumo = {
  nome: string;
  cpf_cnpj?: string | null;
  telefone: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
};

export type Servico = {
  id: string;
  numero_pedido: number;
  cliente_id: string;
  tipo: ServicoTipo;
  status: ServicoStatus;
  data_agendada: string;
  duracao_estimada_minutos?: number | null;
  iniciado_em?: string | null;
  tecnico_id: string | null;
  descricao: string | null;
  relatorio: string | null;
  produtos_usados: string | null;
  valor: number | null;
  horas_mao_obra: number;
  valor_mao_obra: number;
  desconto: number;
  valor_bruto: number;
  pos_venda: string | null;
  pos_venda_em: string | null;
  concluido_em: string | null;
  pago_em: string | null;
  created_at: string;
  clientes?: ClienteResumo | null;
};

export type Boleto = {
  id: string;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string;
  pago: boolean;
  pago_em: string | null;
  origem: string;
  estoque_entrada_ref: string | null;
  created_at: string;
};

export type TopicoWhatsapp = {
  id: string;
  pergunta: string;
  resposta: string;
  ordem: number;
};


export type Profile = { id: string; nome: string; telefone: string | null };

export type LancamentoTipo = "entrada" | "saida";
export type LancamentoForma =
  | "pix"
  | "dinheiro"
  | "boleto"
  | "cartao_credito"
  | "cartao_debito"
  | "ted"
  | "debito_automatico"
  | "tarifa"
  | "outro";

export type Lancamento = {
  id: string;
  tipo: LancamentoTipo;
  conta: "banco" | "dinheiro";
  descricao: string;
  contraparte: string | null;
  categoria: string;
  forma: LancamentoForma;
  valor: number;
  data: string;
  origem: string;
  observacoes: string | null;
  created_at: string;
};

export type ProdutoEstoque = {
  id: string;
  codigo: string | null;
  produto: string;
  unidade: string;
  quantidade: number;
  valor_custo: number;
  valor_venda: number;
  observacoes: string | null;
};

export type ServicoFoto = {
  id: string;
  servico_id: string;
  storage_path: string;
  url: string;
  created_at: string;
};

export type ServicoCentral = {
  id: string;
  servico_id: string;
  nome: string;
  mac: string | null;
  usuario: string | null;
  senha: string | null;
  foto_url: string | null;
  foto_path: string | null;
  created_at: string;
};

export type ServicoProduto = {
  id: string;
  servico_id: string;
  estoque_id: string | null;
  codigo: string | null;
  produto: string;
  quantidade: number;
  valor_unitario: number;
};

export function enderecoCompleto(c?: ClienteResumo | Cliente | null) {
  if (!c) return "";
  const rua = [c.endereco, c.numero].filter(Boolean).join(", ");
  return [rua, c.bairro, c.cidade].filter(Boolean).join(" - ");
}

export function mapsUrl(c?: ClienteResumo | Cliente | null) {
  const end = enderecoCompleto(c);
  if (!end) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}`;
}


export type NotaFiscalTipo = "compra" | "emitida";

export type NotaFiscal = {
  id: string;
  tipo: NotaFiscalTipo;
  data_emissao: string;
  fornecedor: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  valor_total: number;
  origem: string;
  created_at: string;
};

export type NotaFiscalItem = {
  id: string;
  nota_fiscal_id: string;
  codigo: string | null;
  produto: string;
  unidade: string;
  quantidade: number;
  valor_custo: number;
  valor_venda: number;
};
