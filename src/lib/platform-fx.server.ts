import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError, dbFail } from "@/lib/business.server";

export async function savePlatformFx(
  userId: string,
  input: { usdToZwg: number; source: string; effectiveOn: string; notice: string },
) {
  if (!(input.usdToZwg > 0) || input.usdToZwg > 1_000_000) {
    throw new AppError("Enter a positive ZiG amount per 1 USD.");
  }
  const { error } = await supabaseAdmin.from("platform_fx").upsert({
    id: 1,
    usd_to_zwg: input.usdToZwg,
    source: input.source.trim(),
    effective_on: input.effectiveOn,
    notice: input.notice.trim(),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  if (error) dbFail("save platform fx", error);
}
