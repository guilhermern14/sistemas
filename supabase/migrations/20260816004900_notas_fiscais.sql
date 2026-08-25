-- Notas fiscais: compras e notas emitidas.
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('compra','emitida')),
  data_emissao date NOT NULL DEFAULT current_date,
  fornecedor text,
  numero text,
  serie text,
  chave text,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notas_fiscais_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id uuid NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  codigo text,
  produto text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  quantidade numeric(14,3) NOT NULL DEFAULT 0,
  valor_custo numeric(14,4) NOT NULL DEFAULT 0,
  valor_venda numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_fiscais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_fiscais_itens TO authenticated;
GRANT ALL ON public.notas_fiscais TO service_role;
GRANT ALL ON public.notas_fiscais_itens TO service_role;

ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY notas_fiscais_select_auth ON public.notas_fiscais
FOR SELECT TO authenticated USING (true);
CREATE POLICY notas_fiscais_insert_auth ON public.notas_fiscais
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY notas_fiscais_update_auth ON public.notas_fiscais
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY notas_fiscais_delete_auth ON public.notas_fiscais
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE POLICY notas_fiscais_itens_select_auth ON public.notas_fiscais_itens
FOR SELECT TO authenticated USING (true);
CREATE POLICY notas_fiscais_itens_insert_auth ON public.notas_fiscais_itens
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY notas_fiscais_itens_update_auth ON public.notas_fiscais_itens
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY notas_fiscais_itens_delete_auth ON public.notas_fiscais_itens
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_chave_uidx
ON public.notas_fiscais (chave)
WHERE chave IS NOT NULL AND chave <> '';

CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_manual_uidx
ON public.notas_fiscais (tipo, numero, serie, fornecedor)
WHERE chave IS NULL AND numero IS NOT NULL AND numero <> '';

CREATE INDEX IF NOT EXISTS notas_fiscais_data_idx ON public.notas_fiscais (data_emissao DESC);
CREATE INDEX IF NOT EXISTS notas_fiscais_tipo_idx ON public.notas_fiscais (tipo);

-- Entrada de nota e atualização do estoque em uma única transação.
CREATE OR REPLACE FUNCTION public.importar_nota_fiscal(
  p_tipo text,
  p_data_emissao date,
  p_fornecedor text,
  p_numero text,
  p_serie text,
  p_chave text,
  p_valor_total numeric,
  p_itens jsonb,
  p_origem text DEFAULT 'xml'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nota_id uuid;
  v_item jsonb;
  v_codigo text;
  v_produto text;
  v_unidade text;
  v_qtd numeric;
  v_custo numeric;
  v_venda numeric;
  v_estoque_id uuid;
  v_qtd_atual numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão para importar nota fiscal';
  END IF;

  IF p_tipo NOT IN ('compra','emitida') THEN
    RAISE EXCEPTION 'Tipo de nota inválido';
  END IF;

  -- Impede corrida entre duas importações simultâneas.
  LOCK TABLE public.notas_fiscais IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.estoque IN SHARE ROW EXCLUSIVE MODE;

  IF COALESCE(NULLIF(trim(p_chave), ''), '') <> '' THEN
    SELECT id INTO v_nota_id
    FROM public.notas_fiscais
    WHERE chave = trim(p_chave)
    LIMIT 1;

    IF v_nota_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esta nota fiscal já foi importada';
    END IF;
  ELSIF NULLIF(trim(p_numero), '') IS NOT NULL THEN
    SELECT id INTO v_nota_id
    FROM public.notas_fiscais
    WHERE tipo = p_tipo
      AND numero = trim(p_numero)
      AND COALESCE(serie, '') = COALESCE(NULLIF(trim(p_serie), ''), '')
      AND COALESCE(fornecedor, '') = COALESCE(NULLIF(trim(p_fornecedor), ''), '')
      AND chave IS NULL
    LIMIT 1;

    IF v_nota_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esta nota fiscal já foi cadastrada';
    END IF;
  END IF;

  INSERT INTO public.notas_fiscais (
    tipo, data_emissao, fornecedor, numero, serie, chave, valor_total, origem, created_by
  )
  VALUES (
    p_tipo,
    COALESCE(p_data_emissao, current_date),
    NULLIF(trim(p_fornecedor), ''),
    NULLIF(trim(p_numero), ''),
    NULLIF(trim(p_serie), ''),
    NULLIF(trim(p_chave), ''),
    COALESCE(p_valor_total, 0),
    COALESCE(NULLIF(trim(p_origem), ''), 'manual'),
    auth.uid()
  )
  RETURNING id INTO v_nota_id;

  IF jsonb_typeof(COALESCE(p_itens, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Itens da nota inválidos';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb))
  LOOP
    v_codigo := NULLIF(trim(v_item->>'codigo'), '');
    v_produto := NULLIF(trim(v_item->>'produto'), '');
    v_unidade := COALESCE(NULLIF(trim(v_item->>'unidade'), ''), 'un');
    v_qtd := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_custo := COALESCE((v_item->>'valor_custo')::numeric, 0);
    v_venda := COALESCE((v_item->>'valor_venda')::numeric, 0);

    IF v_produto IS NULL OR v_qtd <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notas_fiscais_itens (
      nota_fiscal_id, codigo, produto, unidade, quantidade, valor_custo, valor_venda
    )
    VALUES (
      v_nota_id, v_codigo, v_produto, v_unidade, v_qtd, v_custo, v_venda
    );

    -- Somente notas de compra alteram o estoque.
    IF p_tipo = 'compra' THEN
      v_estoque_id := NULL;

      IF v_codigo IS NOT NULL THEN
        SELECT id, quantidade
        INTO v_estoque_id, v_qtd_atual
        FROM public.estoque
        WHERE codigo = v_codigo
        LIMIT 1;
      END IF;

      IF v_estoque_id IS NULL THEN
        SELECT id, quantidade
        INTO v_estoque_id, v_qtd_atual
        FROM public.estoque
        WHERE lower(trim(produto)) = lower(trim(v_produto))
        LIMIT 1;
      END IF;

      IF v_estoque_id IS NOT NULL THEN
        UPDATE public.estoque
        SET quantidade = COALESCE(v_qtd_atual, 0) + v_qtd,
            valor_custo = v_custo,
            valor_venda = v_venda,
            unidade = v_unidade
        WHERE id = v_estoque_id;
      ELSE
        INSERT INTO public.estoque (
          codigo, produto, unidade, quantidade, valor_custo, valor_venda
        )
        VALUES (
          v_codigo, v_produto, v_unidade, v_qtd, v_custo, v_venda
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_nota_id;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_nota_fiscal(text, date, text, text, text, text, numeric, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_nota_fiscal(text, date, text, text, text, text, numeric, jsonb, text) TO authenticated;
