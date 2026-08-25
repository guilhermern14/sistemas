-- Substitui o GoTrue: só o mínimo necessário para as migrações do seu
-- sistema funcionarem sem alteração nenhuma (elas referenciam auth.users
-- e a função auth.uid(), exatamente como no Supabase).

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  encrypted_password text NOT NULL,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- auth.uid(): o servidor Node define "request.jwt.claim.sub" antes de cada
-- consulta (equivalente ao que o PostgREST faz), então essa função devolve
-- o id do usuário logado, exatamente como no Supabase.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO service_role;

-- Stub mínimo do schema "storage" só para as migrações do seu sistema (que
-- criam políticas em storage.objects) aplicarem sem erro. O upload/leitura
-- de fotos de verdade é feito pelo servidor Node direto em disco, não passa
-- por aqui.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
