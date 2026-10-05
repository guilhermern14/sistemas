import type { Aviso } from "./types";

export const getHojeISO = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getAmanhaISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Retorna se o aviso deve aparecer na tela inicial / ao entrar no sistema:
 * - Status deve ser 'pendente' (ainda não resolvido)
 * - Data do aviso deve ser até amanhã (ou seja: 1 dia antes, no dia exato ou dias anteriores/atrasados)
 * - Permanece ativo nos dias seguintes até ser marcado como resolvido
 */
export function deveAparecerNaTelaInicial(aviso: Aviso): boolean {
  if (aviso.status === "resolvido") return false;
  if (!aviso.data_aviso) return false;
  const dataAmanha = getAmanhaISO();
  // String comparison YYYY-MM-DD works chronologically
  return aviso.data_aviso <= dataAmanha;
}

export type AvisoUrgencia = "atrasado" | "hoje" | "amanha" | "futuro" | "resolvido";

export function getUrgenciaAviso(aviso: Aviso): {
  tipo: AvisoUrgencia;
  label: string;
  badgeClass: string;
  cardBorderClass: string;
  diasDiferenca: number;
} {
  if (aviso.status === "resolvido") {
    return {
      tipo: "resolvido",
      label: "Resolvido",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      cardBorderClass: "border-emerald-200 bg-emerald-50/30",
      diasDiferenca: 0,
    };
  }

  const hoje = getHojeISO();

  // Calcular diferença de dias
  const [anoA, mesA, diaA] = aviso.data_aviso.split("-").map(Number);
  const [anoH, mesH, diaH] = hoje.split("-").map(Number);
  const dataAvisoObj = new Date(anoA, mesA - 1, diaA);
  const dataHojeObj = new Date(anoH, mesH - 1, diaH);
  const diffTime = dataAvisoObj.getTime() - dataHojeObj.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const atraso = Math.abs(diffDays);
    return {
      tipo: "atrasado",
      label: `Atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"}`,
      badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
      cardBorderClass: "border-rose-300 bg-rose-50/30 shadow-xs",
      diasDiferenca: diffDays,
    };
  }

  if (diffDays === 0) {
    return {
      tipo: "hoje",
      label: "Hoje (No dia exato)",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300 font-semibold",
      cardBorderClass: "border-amber-300 bg-amber-50/40 shadow-xs",
      diasDiferenca: 0,
    };
  }

  if (diffDays === 1) {
    return {
      tipo: "amanha",
      label: "Amanhã (1 dia antes)",
      badgeClass: "bg-blue-100 text-blue-800 border-blue-300 font-semibold",
      cardBorderClass: "border-blue-200 bg-blue-50/30",
      diasDiferenca: 1,
    };
  }

  return {
    tipo: "futuro",
    label: `Em ${diffDays} dias`,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    cardBorderClass: "border-slate-200 bg-white",
    diasDiferenca: diffDays,
  };
}

export function formatarDataBR(dataStr?: string | null): string {
  if (!dataStr) return "—";
  const parts = dataStr.split("T")[0].split("-");
  if (parts.length < 3) return dataStr;
  const [ano, mes, dia] = parts;
  return `${dia}/${mes}/${ano}`;
}
