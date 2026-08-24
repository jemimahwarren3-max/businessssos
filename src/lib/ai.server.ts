import { AppError, assertPermission, loadDashboard, loadReports, type Db } from "./business.server";
import { GroqProvider } from "./ai/groq-provider";
import type { ChatMessage } from "./ai/provider";
import { formatMoney } from "./format";
import { checkRateLimit } from "./rate-limit.server";

const HISTORY_LIMIT = 12;
// Bounds cumulative Groq cost per business independent of how many staff
// members share the per-minute bucket — a 24h window via the same
// check_rate_limit primitive the per-minute limits use.
const DAILY_LIMIT = 100;
const DAILY_WINDOW_SECONDS = 60 * 60 * 24;

const SYSTEM_PROMPT = `You are the BusinessOS AI assistant, built into a small-business management app.
Answer questions about the business using ONLY the data given to you below — never invent numbers,
customers, or products that aren't in it. Keep answers short (2-4 sentences), in plain language a
non-accountant would understand — no jargon like "COGS" or "accounts receivable". If the data doesn't
cover what's being asked, say so honestly instead of guessing. You cannot take any actions (create
invoices, record sales, etc.) — you can only discuss the numbers you're given.`;

/** Builds a compact, structured snapshot of the business — never raw DB
 * access — so the model only ever sees the minimum it needs to answer. */
export async function buildBusinessSummary(
  supabase: Db,
  businessId: string,
  days = 30,
): Promise<string> {
  const [dashboard, reports] = await Promise.all([
    loadDashboard(supabase, businessId, days),
    loadReports(supabase, businessId, days),
  ]);
  const c = reports.currency;

  const lines = [
    `All figures cover the last ${days} days and are in ${c}.`,
    `Total sales: ${formatMoney(reports.totalSales, c)}`,
    `Gross profit: ${formatMoney(reports.totalProfit, c)} (${reports.profitMargin.toFixed(1)}% margin)`,
    `Total expenses: ${formatMoney(reports.totalExpenses, c)}`,
    `Net profit (gross profit minus expenses): ${formatMoney(reports.netProfit, c)}`,
    `Customers who currently owe money: ${formatMoney(dashboard.outstanding, c)} across ${dashboard.outstandingCustomers} customer(s)`,
    `Low stock products: ${dashboard.lowStockCount} (${dashboard.urgentStockCount} completely out of stock)`,
    `Business health score: ${dashboard.health.score}/100 (${dashboard.health.label})`,
  ];

  if (reports.topProducts.length > 0) {
    lines.push(
      `Top selling products: ${reports.topProducts
        .slice(0, 5)
        .map((p) => `${p.name} (${formatMoney(p.revenue, c)}, ${p.quantity} sold)`)
        .join("; ")}`,
    );
  } else {
    lines.push(`No sales recorded in the last ${days} days.`);
  }

  if (reports.topCustomers.length > 0) {
    lines.push(
      `Top customers by purchases: ${reports.topCustomers
        .slice(0, 5)
        .map((cust) => `${cust.name} (${formatMoney(cust.total, c)})`)
        .join("; ")}`,
    );
  }

  if (reports.expensesByCategory.length > 0) {
    lines.push(
      `Expenses by category: ${reports.expensesByCategory
        .map((e) => `${e.category}: ${formatMoney(e.amount, c)}`)
        .join("; ")}`,
    );
  }

  lines.push(
    `Inventory on hand is worth ${formatMoney(reports.inventory.costValue, c)} at cost (${formatMoney(reports.inventory.retailValue, c)} at retail) across ${reports.inventory.productCount} products.`,
  );

  if (dashboard.lowStock.length > 0) {
    lines.push(
      `Products running low: ${dashboard.lowStock.map((p) => `${p.name} (${p.stock} ${p.unit} left)`).join("; ")}`,
    );
  }

  return lines.join("\n");
}

export type AssistantMessage = { role: "user" | "assistant"; content: string };

export async function askAssistant(
  supabase: Db,
  businessId: string,
  messages: AssistantMessage[],
): Promise<{ answer: string }> {
  await assertPermission(supabase, businessId, "ai.use");

  const withinDailyLimit = await checkRateLimit(
    `ai-daily-assistant:business:${businessId}`,
    DAILY_LIMIT,
    DAILY_WINDOW_SECONDS,
  );
  if (!withinDailyLimit) {
    throw new AppError(
      "This business has reached its daily AI assistant usage limit. Please try again tomorrow.",
    );
  }

  const summary = await buildBusinessSummary(supabase, businessId);
  const chatMessages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nBusiness snapshot:\n${summary}` },
    ...messages.slice(-HISTORY_LIMIT),
  ];

  const provider = new GroqProvider();
  try {
    const answer = await provider.chat(chatMessages);
    return { answer };
  } catch (error) {
    console.error("[businessos] ai assistant failed", error);
    throw new AppError("The AI assistant isn't available right now. Please try again shortly.");
  }
}
