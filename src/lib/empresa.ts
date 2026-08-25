export const EMPRESA = {
  nome: "Nascimento Sistemas de Segurança",
  telefone: "47 99973-5625",
  cnpj: "31.649.330.0001/36",
  validadeDias: 10,
} as const;

export const PRIMEIRA_HORA = 100;
export const HORA_ADICIONAL = 60;

/** Mão de obra: primeira hora R$100, demais R$60/h. */
export function calcMaoObra(horas: number) {
  const h = Number(horas) || 0;
  if (h <= 0) return 0;
  if (h <= 1) return PRIMEIRA_HORA;
  return Number((PRIMEIRA_HORA + (h - 1) * HORA_ADICIONAL).toFixed(2));
}
