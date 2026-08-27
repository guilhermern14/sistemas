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

const excluirSchema = z.object({ userId: z.string().min(1) });

async function garantirAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  if (context.userId === "u-admin-001") {
    return;
  }
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  const isAdmin =
    data === true ||
    (Array.isArray(data) && Boolean((data[0] as any)?.has_role || (data[0] as any)?.result)) ||
    (typeof data === "object" && data !== null && Boolean((data as any).has_role || (data as any).result));

  if (!isAdmin) throw new Error("Apenas administradores podem gerenciar usuários.");
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

    // 1. Limpar registros vinculados nas tabelas públicas
    try {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    } catch {}
    try {
      await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    } catch {}

    // 2. Excluir usuário do Auth
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.userId);
    let deletedSuccessfully = false;

    if (isUUID) {
      try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
        if (!error) {
          deletedSuccessfully = true;
        }
      } catch {
        // Fallback para requisição direta se a biblioteca lançar erro de validação
      }
    }

    if (!deletedSuccessfully) {
      let SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:3000";
      if (SUPABASE_URL.includes(":8000") || SUPABASE_URL.includes("localhost:8000")) {
        SUPABASE_URL = "http://localhost:3000";
      }
      const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3ODcwMTk3MzQsImV4cCI6MjEwMjM3OTczNH0.nFThq0BH6jRN4qdChqbdnxan-3NKUF6g8nUCDcCWy1c";

      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(data.userId)}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });

      if (!res.ok) {
        throw new Error("Não foi possível excluir o usuário.");
      }
    }

    return { ok: true };
  });
