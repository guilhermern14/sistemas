CREATE TABLE public.financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  conta text NOT NULL DEFAULT 'banco' CHECK (conta IN ('banco','dinheiro')),
  descricao text NOT NULL DEFAULT '',
  contraparte text,
  categoria text NOT NULL DEFAULT 'outros',
  forma text NOT NULL DEFAULT 'outro',
  valor numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT current_date,
  origem text NOT NULL DEFAULT 'manual',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_lanc_select ON public.financeiro_lancamentos
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY financeiro_lanc_insert ON public.financeiro_lancamentos
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY financeiro_lanc_update ON public.financeiro_lancamentos
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE POLICY financeiro_lanc_delete ON public.financeiro_lancamentos
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE INDEX financeiro_lancamentos_data_idx ON public.financeiro_lancamentos (data DESC);

CREATE TRIGGER financeiro_lancamentos_updated_at
BEFORE UPDATE ON public.financeiro_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();