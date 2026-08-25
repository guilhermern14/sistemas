CREATE TABLE public.whatsapp_topicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta text NOT NULL,
  resposta text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_topicos TO authenticated;
GRANT ALL ON public.whatsapp_topicos TO service_role;

ALTER TABLE public.whatsapp_topicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_select_auth" ON public.whatsapp_topicos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "whatsapp_admin_all" ON public.whatsapp_topicos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_topicos_updated_at
  BEFORE UPDATE ON public.whatsapp_topicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
