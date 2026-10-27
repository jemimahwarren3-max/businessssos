import { createAnonClient } from "@/lib/auth/session.server";
import type { PlatformFx } from "@/lib/billing-plans";

export async function loadPlatformFx(): Promise<PlatformFx | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("platform_fx")
    .select("usd_to_zwg, source, effective_on, notice")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[kwetuu] platform fx", error);
    return null;
  }
  if (!data) return null;
  return {
    usdToZwg: Number(data.usd_to_zwg),
    source: data.source,
    effectiveOn: data.effective_on,
    notice: data.notice,
  };
}
