import { supabase } from "@/integrations/supabase/client";

export const BUCKET_FOTOS = "servico-fotos";
/** 1 ano — as fotos ficam em bucket privado, então usamos URLs assinadas. */
const EXPIRA_SEG = 60 * 60 * 24 * 365;

export async function assinarUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, "").replace(/^servico-fotos\//, "");
  const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(cleanPath, EXPIRA_SEG);
  if (error) throw error;
  return data.signedUrl;
}

/** Garante uma URL válida a partir do caminho salvo (usada na exibição e no PDF). */
export async function urlFoto(path: string | null | undefined, fallback?: string | null) {
  if (path) {
    try {
      const signed = await assinarUrl(path);
      if (signed) return signed;
    } catch {}
  }
  if (fallback) {
    return fallback.replace(/\/storage\/v1\/storage\/v1\//g, "/storage/v1/");
  }
  return null;
}
