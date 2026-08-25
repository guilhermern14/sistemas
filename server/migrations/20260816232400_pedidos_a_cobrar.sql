-- Numeração sequencial dos pedidos e fluxo de cobrança para atendente.
CREATE SEQUENCE IF NOT EXISTS public.servicos_numero_pedido_seq;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS numero_pedido bigint;

-- Preenche serviços antigos sem número, preservando a ordem de criação.
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS numero
  FROM public.servicos
  WHERE numero_pedido IS NULL
)
UPDATE public.servicos s
SET numero_pedido = n.numero
FROM numerados n
WHERE s.id = n.id;

SELECT setval(
  'public.servicos_numero_pedido_seq',
  GREATEST(COALESCE((SELECT MAX(numero_pedido) FROM public.servicos), 0), 1),
  (SELECT COUNT(*) > 0 FROM public.servicos)
);

ALTER SEQUENCE public.servicos_numero_pedido_seq
  OWNED BY public.servicos.numero_pedido;

ALTER TABLE public.servicos
  ALTER COLUMN numero_pedido SET DEFAULT nextval('public.servicos_numero_pedido_seq'),
  ALTER COLUMN numero_pedido SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS servicos_numero_pedido_uidx
  ON public.servicos (numero_pedido);

COMMENT ON COLUMN public.servicos.numero_pedido IS 'Número sequencial do pedido/serviço.';
