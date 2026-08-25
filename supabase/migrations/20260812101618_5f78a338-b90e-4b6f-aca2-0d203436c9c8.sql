ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS numero text;

ALTER TABLE public.estoque ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.estoque ADD COLUMN IF NOT EXISTS valor_custo numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estoque ADD COLUMN IF NOT EXISTS valor_venda numeric NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS estoque_codigo_uidx ON public.estoque (codigo) WHERE codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.servico_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  estoque_id uuid REFERENCES public.estoque(id) ON DELETE SET NULL,
  codigo text,
  produto text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servico_produtos TO authenticated;
GRANT ALL ON public.servico_produtos TO service_role;

ALTER TABLE public.servico_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY servico_produtos_select_auth ON public.servico_produtos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY servico_produtos_insert ON public.servico_produtos
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR (public.has_role(auth.uid(), 'campo') AND EXISTS (
      SELECT 1 FROM public.servicos s
      WHERE s.id = servico_id AND s.tecnico_id = auth.uid()
        AND s.status IN ('agendado','em_andamento','pronto')
    ))
  );

CREATE POLICY servico_produtos_update ON public.servico_produtos
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR (public.has_role(auth.uid(), 'campo') AND EXISTS (
      SELECT 1 FROM public.servicos s
      WHERE s.id = servico_id AND s.tecnico_id = auth.uid()
        AND s.status IN ('agendado','em_andamento','pronto')
    ))
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'campo')
  );

CREATE POLICY servico_produtos_delete ON public.servico_produtos
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR (public.has_role(auth.uid(), 'campo') AND EXISTS (
      SELECT 1 FROM public.servicos s
      WHERE s.id = servico_id AND s.tecnico_id = auth.uid()
        AND s.status IN ('agendado','em_andamento','pronto')
    ))
  );

CREATE POLICY servicos_update_campo_pronto ON public.servicos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'campo') AND tecnico_id = auth.uid() AND status IN ('agendado','em_andamento','pronto'))
  WITH CHECK (public.has_role(auth.uid(), 'campo') AND tecnico_id = auth.uid() AND status IN ('agendado','em_andamento','pronto'));