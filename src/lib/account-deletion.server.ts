import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError, dbFail, type Db } from "./business.server";

// Order matters: businesses.created_by has no cascade from auth.users, so the
// owned-business delete (via the RLS-scoped client, so it only ever touches
// what this caller actually owns) must happen before the admin API call that
// removes the login — deleting the user first would fail on that FK.
export async function deleteMyAccount(supabase: Db, userId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_owned_businesses");
  if (error) dbFail("delete owned businesses", error);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("[businessos] account deletion: auth user delete failed", authError);
    throw new AppError(
      "Your business data was deleted, but we couldn't remove your login. Contact support to finish closing your account.",
    );
  }
}
