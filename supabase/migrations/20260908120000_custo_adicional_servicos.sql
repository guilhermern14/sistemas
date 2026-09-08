-- Adiciona campos de custo adicional (deslocamento, gasolina, almoço, pedágio)
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS custo_adicional numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao_custo_adicional text,
  ADD COLUMN IF NOT EXISTS incluir_custo_no_total boolean DEFAULT false;

COMMENT ON COLUMN public.servicos.custo_adicional IS 'Custo adicional operacional da execução do serviço (gasolina, almoço, pedágio, etc.)';
COMMENT ON COLUMN public.servicos.descricao_custo_adicional IS 'Detalhamento das despesas adicionais';
COMMENT ON COLUMN public.servicos.incluir_custo_no_total IS 'Indica se a despesa deve ser somada ao valor bruto a ser cobrado do cliente';
