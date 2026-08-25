CREATE TYPE public.app_role AS ENUM ('admin','atendente','campo','financeiro');
CREATE TYPE public.servico_status AS ENUM ('agendado','em_andamento','pronto','a_cobrar','pago');
CREATE TYPE public.servico_tipo AS ENUM ('instalacao','manutencao','orcamento');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  telefone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'atendente'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  endereco text,
  bairro text,
  cidade text,
  observacoes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select_auth" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));
CREATE POLICY "clientes_delete_admin" ON public.clientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo public.servico_tipo NOT NULL DEFAULT 'manutencao',
  status public.servico_status NOT NULL DEFAULT 'agendado',
  data_agendada timestamptz NOT NULL DEFAULT now(),
  tecnico_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  descricao text,
  relatorio text,
  produtos_usados text,
  valor numeric(12,2),
  pos_venda text,
  pos_venda_em timestamptz,
  concluido_em timestamptz,
  pago_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servicos_select_auth" ON public.servicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "servicos_insert" ON public.servicos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));
CREATE POLICY "servicos_update_admin" ON public.servicos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "servicos_update_atendente" ON public.servicos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'atendente')) WITH CHECK (public.has_role(auth.uid(),'atendente'));
CREATE POLICY "servicos_update_financeiro" ON public.servicos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'financeiro')) WITH CHECK (public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "servicos_update_campo" ON public.servicos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'campo') AND tecnico_id = auth.uid()) WITH CHECK (public.has_role(auth.uid(),'campo') AND tecnico_id = auth.uid());
CREATE POLICY "servicos_delete_admin" ON public.servicos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  quantidade numeric(12,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque TO authenticated;
GRANT ALL ON public.estoque TO service_role;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estoque_select_auth" ON public.estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "estoque_write" ON public.estoque FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "estoque_update" ON public.estoque FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro')) WITH CHECK (true);
CREATE POLICY "estoque_delete_admin" ON public.estoque FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));