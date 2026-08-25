export const statusLabels = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  pronto: "Serviço pronto",
  a_cobrar: "A cobrar",
  pago: "Pago / Finalizado",
} as const;

export type ServicoStatus = keyof typeof statusLabels;

export const tipoLabels = {
  instalacao: "Instalação",
  manutencao: "Manutenção",
  orcamento: "Orçamento",
} as const;

export type ServicoTipo = keyof typeof tipoLabels;

export const statusBadgeClass: Record<ServicoStatus, string> = {
  agendado: "bg-secondary text-secondary-foreground",
  em_andamento: "bg-info/15 text-info",
  pronto: "bg-primary/15 text-primary",
  a_cobrar: "bg-warning/20 text-warning-foreground",
  pago: "bg-success/20 text-success-foreground",
};

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toLocalInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
