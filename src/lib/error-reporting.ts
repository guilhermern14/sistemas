// Ponto único para reportar erros de renderização capturados pelo error boundary
// da raiz do app. Fica local por padrão (apenas console.error); se no futuro você
// quiser mandar esses erros para algum serviço de monitoramento próprio (Sentry
// autohospedado, etc.), é só implementar aqui.

export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  console.error("[app-error]", message, { route: window.location.pathname, ...context });
}
