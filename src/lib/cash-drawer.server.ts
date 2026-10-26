import { z } from "zod";
import { assertCanOperate, dbFail, type Db } from "./business.server";

const movementSchema = z.object({
  id: z.string(),
  kind: z.string(),
  amount: z.coerce.number(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

const sessionSummarySchema = z.object({
  id: z.string(),
  openedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  openingFloat: z.coerce.number(),
  expected: z.coerce.number().nullable().optional(),
  counted: z.coerce.number().nullable().optional(),
  discrepancy: z.coerce.number().nullable().optional(),
});

export const cashDrawerSchema = z.object({
  open: z.boolean(),
  sessionId: z.string().optional(),
  openedAt: z.string().optional(),
  openingFloat: z.coerce.number().optional(),
  note: z.string().nullable().optional(),
  expected: z.coerce.number().optional(),
  movements: z.array(movementSchema).optional(),
  sessions: z.array(sessionSummarySchema).catch([]),
});

export type CashDrawer = z.infer<typeof cashDrawerSchema>;

export async function loadCashDrawer(supabase: Db, businessId: string): Promise<CashDrawer> {
  const { data, error } = await supabase.rpc("get_cash_drawer", { _business_id: businessId });
  if (error) dbFail("load cash drawer", error);
  return cashDrawerSchema.parse(data ?? { open: false, sessions: [] });
}

export async function openCashSession(
  supabase: Db,
  businessId: string,
  openingFloat: number,
  note: string,
): Promise<{ id: string }> {
  await assertCanOperate(supabase, businessId);
  const { data, error } = await supabase.rpc("open_cash_session", {
    _business_id: businessId,
    _opening_float: openingFloat,
    _note: (note || null) as never,
  });
  if (error) dbFail("open cash drawer", error);
  return { id: data as string };
}

export async function closeCashSession(
  supabase: Db,
  businessId: string,
  countedCash: number,
  note: string,
) {
  await assertCanOperate(supabase, businessId);
  const { data, error } = await supabase.rpc("close_cash_session", {
    _business_id: businessId,
    _counted_cash: countedCash,
    _note: (note || null) as never,
  });
  if (error) dbFail("close cash drawer", error);
  return data;
}

export async function addCashMovement(
  supabase: Db,
  businessId: string,
  kind: "pay_in" | "pay_out",
  amount: number,
  note: string,
): Promise<{ id: string }> {
  await assertCanOperate(supabase, businessId);
  const { data, error } = await supabase.rpc("add_cash_movement", {
    _business_id: businessId,
    _kind: kind,
    _amount: amount,
    _note: note,
  });
  if (error) dbFail("record cash movement", error);
  return { id: data as string };
}
