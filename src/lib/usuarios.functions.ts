import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const roleEnum = z.enum(["admin", "atendente", "campo", "financeiro"]);

const criarSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
  nome: z.string().min(1),
  role: roleEnum,
});

const excluirSchema = z.object({ userId: z.string().uuid() });

async function garantirAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Apenas administradores podem gerenciar usuários.");
}

export const listarUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await garantirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error("Não foi possível carregar os e-mails.");
    return data.users.map((u) => ({ id: u.id, email: u.email ?? "" }));
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => criarSchema.parse(d))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, role: data.role },
    });
    if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    const userId = criado.user.id;
    await supabaseAdmin.from("profiles").upsert({ id: userId, nome: data.nome });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleError) throw new Error("Usuário criado, mas a função não pôde ser definida.");

    return { id: userId };
  });

export const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => excluirSchema.parse(d))
  .handler(async ({ data, context }) => {
    await garantirAdmin(context as never);
    if (data.userId === context.userId) throw new Error("Você não pode excluir o próprio usuário.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Não foi possível excluir o usuário.");
    return { ok: true };
  });
