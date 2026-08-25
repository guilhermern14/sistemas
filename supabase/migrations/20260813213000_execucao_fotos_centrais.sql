-- Fotos do serviço executado e dados das centrais
CREATE TABLE IF NOT EXISTS public.servico_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servico_fotos TO authenticated;
GRANT ALL ON public.servico_fotos TO service_role;
ALTER TABLE public.servico_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY servico_fotos_select_auth ON public.servico_fotos FOR SELECT TO authenticated USING (true);
CREATE POLICY servico_fotos_insert_auth ON public.servico_fotos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY servico_fotos_update_auth ON public.servico_fotos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY servico_fotos_delete_auth ON public.servico_fotos FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.servico_centrais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Central',
  mac text,
  usuario text,
  senha text,
  foto_url text,
  foto_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servico_centrais TO authenticated;
GRANT ALL ON public.servico_centrais TO service_role;
ALTER TABLE public.servico_centrais ENABLE ROW LEVEL SECURITY;
CREATE POLICY servico_centrais_select_auth ON public.servico_centrais FOR SELECT TO authenticated USING (true);
CREATE POLICY servico_centrais_insert_auth ON public.servico_centrais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY servico_centrais_update_auth ON public.servico_centrais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY servico_centrais_delete_auth ON public.servico_centrais FOR DELETE TO authenticated USING (true);

-- Bucket público para que as fotos possam ser exibidas também no PDF gerado pelo navegador.
INSERT INTO storage.buckets (id, name, public)
VALUES ('servico-fotos', 'servico-fotos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "servico_fotos_storage_select" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_update" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'servico-fotos') WITH CHECK (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'servico-fotos');
