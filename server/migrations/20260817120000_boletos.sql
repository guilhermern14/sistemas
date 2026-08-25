-- Tabela de boletos (contas a pagar) usada pelas telas Boletos e Estoque.
CREATE TABLE IF NOT EXISTS public.boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor text,
  descricao text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  vencimento date NOT NULL,
  pago boolean NOT NULL DEFAULT false,
  pago_em timestamptz,
  origem text NOT NULL DEFAULT 'manual',
  estoque_entrada_ref uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boletos TO authenticated;
GRANT ALL ON public.boletos TO service_role;

ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boletos_select_fin" ON public.boletos;
CREATE POLICY "boletos_select_fin" ON public.boletos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "boletos_write_fin" ON public.boletos;
CREATE POLICY "boletos_write_fin" ON public.boletos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

CREATE INDEX IF NOT EXISTS boletos_vencimento_idx ON public.boletos (vencimento);

-- Entradas de estoque (feitas por atendente/campo) também geram boletos.
DROP POLICY IF EXISTS "boletos_insert_auth" ON public.boletos;
CREATE POLICY "boletos_insert_auth" ON public.boletos FOR INSERT TO authenticated
WITH CHECK (true);
