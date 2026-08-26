import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extrairLancamentosDeterministicos, ehPalavraRuido } from "./extrato-parser";

const schema = z.object({ texto: z.string().min(10).max(120000) });

const SISTEMA = `Você é um assistente especialista em extrair lançamentos financeiros de extratos bancários brasileiros.
Analise o texto do extrato bancário e devolva EXCLUSIVAMENTE um JSON com a lista de lançamentos encontrados.
Formato obrigatório do JSON:
{
  "lancamentos": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "Descrição da linha do extrato bancário (ex: 'COMP VISA ELECTRO', 'PIX RECEB.OUTRA IF', 'VENCIMENTO CHEQUE ESPECIAL EMPRESARIAL:')",
      "contraparte": "Nome real da pessoa física ou empresa (ex: 'MAYSON ROGERIO DE SOUZA', 'ROZENEIDE GOMES FERREIRA') ou null se for tarifa, cartão ou operação geral",
      "valor": 123.45,
      "tipo": "entrada" | "saida",
      "forma": "pix" | "dinheiro" | "boleto" | "cartao_credito" | "cartao_debito" | "ted" | "debito_automatico" | "tarifa" | "outro",
      "categoria": "vendas" | "servicos" | "fornecedores" | "tarifas" | "impostos" | "pessoal" | "combustivel" | "aluguel" | "outros"
    }
  ]
}
Regras Críticas:
1. descricao: Mantenha a descrição bancária da transação exatamente como descrita na linha do banco (ex: 'COMP VISA ELECTRO', 'PIX RECEB.OUTRA IF', 'VENCIMENTO CHEQUE ESPECIAL EMPRESARIAL:'). Se houver observação/mensagem do cliente no PIX (ex: 'pagto Edivaldo interfone'), inclua ao lado como 'PIX RECEB.OUTRA IF · pagto Edivaldo interfone'.
2. contraparte (QUEM PAGOU / RECEBEU):
   - Deve ser EXCLUSIVAMENTE o NOME real da pessoa ou empresa (ex: 'MAYSON ROGERIO DE SOUZA', 'ROZENEIDE GOMES FERREIRA').
   - NUNCA coloque termos bancários ou operacionais na contraparte como 'RECEB.OUTRA IF', 'TRANSF.OUTRA IF', 'COMP VISA ELECTRO', 'CHEQUE ESPECIAL', 'VENCIMENTO CHEQUE ESPECIAL', 'TARIFA', 'PIX RECEBIDO', etc. Se não houver pessoa física ou jurídica identificada, defina contraparte como null.
   - Em blocos multilinhas de PIX/transferência, o nome da pessoa/empresa geralmente aparece na 2ª ou 3ª linha do bloco (ex: '55 349 398 MAYSON ROGERIO DE SOUZA' -> contraparte: 'MAYSON ROGERIO DE SOUZA'). Remova raízes e dígitos de CNPJ/CPF antes do nome.
3. tipo: "entrada" para créditos/recebimentos (+ ou C), "saida" para débitos/pagamentos (- ou D).
4. O valor numérico deve ser sempre positivo.
5. Ignore completamente linhas de saldo anterior, saldo do dia, saldo final, limites de cheque e cabeçalhos do banco.
6. Normalize as datas para o formato ISO YYYY-MM-DD.`;

const itemSchema = z.object({
  data: z.string(),
  descricao: z.string().default(""),
  contraparte: z.string().nullable().optional(),
  valor: z.number(),
  tipo: z.enum(["entrada", "saida"]),
  forma: z.enum([
    "pix",
    "dinheiro",
    "boleto",
    "cartao_credito",
    "cartao_debito",
    "ted",
    "debito_automatico",
    "tarifa",
    "outro",
  ]).default("outro"),
  categoria: z.string().default("outros"),
});

export const extrairLancamentosExtrato = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const texto = data.texto;

    const sanitizarItem = (d: z.infer<typeof itemSchema>) => ({
      ...d,
      contraparte: d.contraparte && !ehPalavraRuido(d.contraparte) ? d.contraparte.trim() : null,
    });

    // 1. Tentar processar via Gemini API se a chave estiver presente
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            { text: SISTEMA },
            { text: `Aqui está o texto do extrato bancário:\n\n${texto}` },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        const textOutput = response.text || "";
        if (textOutput.trim()) {
          const parsed = JSON.parse(textOutput) as { lancamentos?: unknown };
          if (Array.isArray(parsed.lancamentos) && parsed.lancamentos.length > 0) {
            const validados = parsed.lancamentos
              .map((l) => itemSchema.safeParse(l))
              .filter((r) => r.success)
              .map((r) => sanitizarItem(r.data));
            if (validados.length > 0) {
              return validados;
            }
          }
        }
      } catch (err) {
        console.warn("Falha no processamento Gemini de extrato, usando parser determinístico:", err);
      }
    }

    // 2. Tentar endpoint customizado legado se configurado
    const apiUrl = process.env["EXTRATO_IA_URL"];
    const apiKey = process.env["EXTRATO_IA_API_KEY"];
    if (apiUrl && apiKey) {
      try {
        const resp = await fetch(apiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [
              { role: "system", content: SISTEMA },
              { role: "user", content: texto },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const conteudo = json.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(conteudo) as { lancamentos?: unknown };
          if (Array.isArray(parsed.lancamentos) && parsed.lancamentos.length > 0) {
            const validados = parsed.lancamentos
              .map((l) => itemSchema.safeParse(l))
              .filter((r) => r.success)
              .map((r) => sanitizarItem(r.data));
            if (validados.length > 0) {
              return validados;
            }
          }
        }
      } catch (err) {
        console.warn("Falha no endpoint customizado de extrato:", err);
      }
    }

    // 3. Fallback determinístico offline/automático: extrai lançamentos com regras bancárias brasileiras
    const extraidos = extrairLancamentosDeterministicos(texto);
    return extraidos.map((l) => sanitizarItem(itemSchema.parse(l)));
  });
