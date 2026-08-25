import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ texto: z.string().min(10).max(120000) });

const SISTEMA = `Você extrai lançamentos financeiros de extratos bancários brasileiros em texto puro.
Responda SOMENTE com um JSON válido no formato:
{"lancamentos":[{"data":"YYYY-MM-DD","descricao":"...","contraparte":"nome de quem pagou ou recebeu ou null","valor":123.45,"tipo":"entrada"|"saida","forma":"pix"|"dinheiro"|"boleto"|"cartao_credito"|"cartao_debito"|"ted"|"debito_automatico"|"tarifa"|"outro","categoria":"..."}]}
Regras:
- valor sempre positivo, em número (ponto decimal).
- tipo "entrada" para créditos/recebimentos, "saida" para débitos/pagamentos.
- ignore linhas de saldo, totais e cabeçalhos.
- categoria curta em português (ex.: "vendas", "fornecedores", "tarifas", "impostos", "combustível", "outros").`;

export const extrairLancamentosExtrato = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    // Leitura automática de extrato via IA é OPCIONAL e está desligada por padrão
    // (o sistema roda 100% sem conexões externas). Para reativar, configure
    // EXTRATO_IA_URL e EXTRATO_IA_API_KEY apontando para o provedor de IA de sua
    // escolha (ex.: sua própria conta na Anthropic/OpenAI/Google) no arquivo .env
    // do backend. Sem essas variáveis, use o lançamento manual normalmente.
    const apiUrl = process.env["EXTRATO_IA_URL"];
    const apiKey = process.env["EXTRATO_IA_API_KEY"];
    if (!apiUrl || !apiKey) {
      throw new Error("Leitura automática de extrato está desativada. Lance os itens manualmente.");
    }

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: data.texto },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) throw new Error("Muitas requisições, tente novamente em instantes.");
    if (resp.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!resp.ok) throw new Error("Não foi possível ler o extrato.");

    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const conteudo = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(conteudo) as { lancamentos?: unknown };
    const lista = Array.isArray(parsed.lancamentos) ? parsed.lancamentos : [];

    const item = z.object({
      data: z.string(),
      descricao: z.string().default(""),
      contraparte: z.string().nullable().optional(),
      valor: z.number(),
      tipo: z.enum(["entrada", "saida"]),
      forma: z.string().default("outro"),
      categoria: z.string().default("outros"),
    });

    return lista
      .map((l) => item.safeParse(l))
      .filter((r) => r.success)
      .map((r) => r.data);
  });
