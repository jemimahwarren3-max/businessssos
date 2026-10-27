import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  CreditCard,
  Download,
  FileText,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help | Kwetuu" },
      { name: "description", content: "How to use every part of Kwetuu." },
    ],
  }),
  component: Help,
});

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "sales", label: "Sales (POS)", icon: ShoppingCart },
  { id: "quick-add", label: "Quick Add", icon: Wand2 },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "suppliers", label: "Suppliers & Purchase Orders", icon: Truck },
  { id: "invoices-quotes", label: "Invoices & Quotes", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "insights-assistant", label: "Insights & AI Assistant", icon: Sparkles },
  { id: "importing", label: "Importing from a spreadsheet", icon: Upload },
  { id: "exporting", label: "Exporting your data", icon: Download },
  { id: "roles", label: "Roles & permissions", icon: ShieldCheck },
  { id: "billing", label: "Billing", icon: CreditCard },
] as const;

const ROLE_ROWS = [
  { area: "Sales (POS)", roles: "Owner, Admin, Manager, Cashier" },
  { area: "Invoices & Quotes, create", roles: "Owner, Admin, Manager, Accountant" },
  { area: "Record an invoice payment", roles: "Owner, Admin, Manager, Cashier, Accountant" },
  { area: "Add a customer", roles: "Owner, Admin, Manager, Cashier, Accountant" },
  { area: "Order for a customer/supplier (WhatsApp)", roles: "Owner, Admin, Manager, Accountant" },
  { area: "Suppliers & Purchase Orders", roles: "Owner, Admin, Manager" },
  { area: "Expenses, record or import", roles: "Owner, Admin, Manager, Accountant" },
  {
    area: "Reports, Insights, AI Assistant, Quick Add",
    roles: "Owner, Admin, Manager, Accountant",
  },
  {
    area: "Import products/customers/detailed sales",
    roles: "Owner, Admin, Manager, (Cashier for customers)",
  },
  { area: "Invite/manage team members", roles: "Owner, Admin" },
  { area: "Billing & export data", roles: "Owner, Admin" },
] as const;

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof BarChart3;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="surface scroll-mt-20 space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-2.5 text-sm text-muted-foreground [&_strong]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Help() {
  const navigate = useNavigate();
  const workspace = useWorkspace();

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  if (!workspace.data) return null;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Help"
      subtitle="What every part of Kwetuu does, and how to use it."
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <s.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {s.label}
          </a>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <Section id="dashboard" icon={BarChart3} title="Dashboard">
          <p>
            Your business at a glance: today's sales and profit, money customers currently owe you,
            products running low, and a business health score with plain-language signals (e.g.
            "profit margin dropped this week"). This is the first thing you should check each
            morning.
          </p>
        </Section>

        <Section id="sales" icon={ShoppingCart} title="Sales (POS)">
          <p>Use this to ring up an actual sale, item by item, in real time.</p>
          <ol>
            <li>Tap products to add them to the cart, or search by name/SKU/barcode.</li>
            <li>Adjust quantity, pick a customer (optional, leave blank for a walk-in).</li>
            <li>
              Choose a payment method. Credit sales require a customer, since it adds to what they
              owe.
            </li>
            <li>Complete the sale, stock updates immediately and a receipt is generated.</li>
          </ol>
          <p>
            Works offline: sales made without a connection are queued and sync automatically once
            you're back online.
          </p>
        </Section>

        <Section id="quick-add" icon={Wand2} title="Quick Add">
          <p>
            The <strong>Quick add</strong> button in the top header (on every page) lets you type
            what happened in plain language instead of filling in a form, for example "Sold 3 shirts
            to Mary for $90" or "Paid $45 for transport."
          </p>
          <ol>
            <li>Click Quick add and describe the sale, expense, or new customer.</li>
            <li>Review the draft it builds, every field is editable before anything is saved.</li>
            <li>
              Confirm. It creates a real sale/expense/customer the same way the regular forms do.
            </li>
          </ol>
          <p>
            If it can't confidently match a product you mention, it'll ask you to pick one rather
            than guessing.
          </p>
        </Section>

        <Section id="inventory" icon={Boxes} title="Inventory">
          <p>Every product you sell, with stock on hand, cost, and selling price.</p>
          <ul>
            <li>
              <strong>Add product</strong> for one item at a time, or <strong>Import</strong> to
              bring in a whole product list from a spreadsheet.
            </li>
            <li>
              Set a <strong>Min Stock</strong> level so low-stock items surface on the Dashboard and
              in Reports before you run out.
            </li>
            <li>
              Stock changes (sales, imports, manual adjustments) are all logged as movements you can
              trace back.
            </li>
          </ul>
        </Section>

        <Section id="suppliers" icon={Truck} title="Suppliers & Purchase Orders">
          <p>Keep a directory of who you buy from, and order from them without leaving the app.</p>
          <ul>
            <li>
              Add a supplier's contact details, then use the <strong>Order</strong> button to build
              a purchase order, it pre-fills known prices and opens WhatsApp with the order ready to
              send.
            </li>
            <li>
              <strong>Purchase Orders</strong> lists everything you've ordered, for reference.
              Nothing here changes stock automatically (stock updates when you actually
              receive/import it).
            </li>
          </ul>
        </Section>

        <Section id="invoices-quotes" icon={FileText} title="Invoices & Quotes">
          <p>
            For sales that aren't paid on the spot, or where a customer needs a formal quote first.
          </p>
          <ul>
            <li>Build either the same way, line items, tax, discount, due/valid-until date.</li>
            <li>A quote can be converted straight to an invoice once accepted, with one click.</li>
            <li>
              Both have a <strong>Print</strong> button, it opens your browser's print dialog with a
              clean, chrome-free document layout ready to save as a PDF.
            </li>
            <li>
              Record partial or full payments against an invoice as they come in; its status updates
              automatically.
            </li>
          </ul>
        </Section>

        <Section id="customers" icon={Users} title="Customers">
          <p>Your customer directory, including who currently owes you money.</p>
          <ul>
            <li>
              Add customers one at a time, or <strong>Import</strong> a whole list from a
              spreadsheet.
            </li>
            <li>
              The <strong>Order</strong> button builds a quote for a known customer and opens
              WhatsApp with it pre-filled, using their phone number on file.
            </li>
          </ul>
        </Section>

        <Section id="expenses" icon={Receipt} title="Expenses">
          <p>
            Everything the business spends, rent, utilities, salaries, supplies, and so on. Record
            one at a time or <strong>Import</strong> a batch from a spreadsheet. Categorized
            spending shows up in Reports so you can see where money actually goes.
          </p>
        </Section>

        <Section id="reports" icon={BarChart3} title="Reports">
          <p>
            Sales, profit, expenses, top products and top customers over a time range you choose.
          </p>
          <ul>
            <li>
              <strong>Export to Excel</strong> downloads a real multi-sheet workbook of everything
              on the page.
            </li>
            <li>
              <strong>Import history</strong> backfills past revenue/cost totals for the charts only
              , it doesn't touch stock or link to specific products or customers.
            </li>
            <li>
              <strong>Import detailed sales</strong> is the fuller version: real line-item
              transactions matched to your actual products and customers, which do decrement stock
              and count toward Top Products/Top Customers.
            </li>
          </ul>
        </Section>

        <Section id="insights-assistant" icon={Sparkles} title="Insights & AI Assistant">
          <p>
            <strong>Insights</strong> surfaces things worth your attention automatically, unusual
            expense spikes, slow-moving stock, a weekly summary. <strong>AI Assistant</strong> lets
            you ask questions in plain English ("How did I do this month?", "Who owes me money?")
            and get answers grounded only in your real numbers, it never invents figures, and it
            can't take actions on its own; use Quick Add for that.
          </p>
        </Section>

        <Section id="importing" icon={Upload} title="Importing from a spreadsheet">
          <p>
            Products, Customers, Expenses, and Sales (both the summary and detailed versions) can
            all be bulk-imported from a <strong>.csv or .xlsx</strong> file, up to 500 rows per
            import.
          </p>
          <ol>
            <li>
              Click <strong>Import</strong> on the relevant page and download the CSV template if
              you want the exact column headers.
            </li>
            <li>
              Choose your file, column headers are matched automatically even if they're worded a
              little differently (e.g. "SOH" or "Retail Price" both work for products).
            </li>
            <li>
              Review the preview of every row before confirming, rows with problems are flagged and
              skipped rather than silently failing.
            </li>
          </ol>
          <p>
            Suppliers, Invoices, Quotes, and Purchase Orders don't have bulk import yet, add those
            one at a time for now.
          </p>
        </Section>

        <Section id="exporting" icon={Download} title="Exporting your data">
          <p>
            <strong>Export data</strong> (in the sidebar) downloads everything Kwetuu stores for
            your business, products, customers, sales, invoices, quotes, expenses, stock history, as
            either a full-fidelity <strong>JSON</strong> backup or a browsable{" "}
            <strong>Excel</strong> workbook with one sheet per table. Owners and admins only.
          </p>
        </Section>

        <Section id="roles" icon={ShieldCheck} title="Roles & permissions">
          <p>
            Every team member has one role per business. Each role's exact permissions are
            customizable per business, the table below is the default starting point, not fixed:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-foreground">
                  <th className="py-1.5 pr-4 font-medium">Area</th>
                  <th className="py-1.5 font-medium">Who can do it by default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROLE_ROWS.map((r) => (
                  <tr key={r.area}>
                    <td className="py-1.5 pr-4">{r.area}</td>
                    <td className="py-1.5">{r.roles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Everyone with access to a business can view its Dashboard, Sales, Inventory, and
            Customers.
          </p>
          <p>
            An owner or admin can fine-tune any of this from the <strong>Permissions</strong> tab on
            the Team page, a grid of every permission against the admin/manager/cashier/ accountant
            roles, toggled per business. Owner always keeps full access and can't be restricted,
            including by itself.
          </p>
          <p>
            An owner or admin adds people from the <strong>Team</strong> page in the sidebar, pick a
            role and generate a link, then send it however you like (WhatsApp, SMS, email). Whoever
            opens it signs in or creates an account and joins your business with that role. Roles
            can be changed or a member removed from the same page; a business always keeps at least
            one owner.
          </p>
          <p>
            Day to day, everyone signs in at <strong>/staff-login</strong> with your business name
            and shop password, then their own name and password, owners and admins included, not
            just staff without an email. Signing in with an email and password is still there as a
            fallback from that same page.
          </p>
          <p>
            For staff without an email, most cashiers, say, the same page can create a{" "}
            <strong>name + password</strong> account instead, no link needed. They sign in at{" "}
            <strong>/staff-login</strong> in two steps: first your business name and a shared{" "}
            <strong>shop password</strong> (set from the same card on the Team page, required before
            anyone can even see who's on the team), then pick a name and enter that person's own
            password. An owner/admin can reset a staff member's password from their row if they
            forget it, these accounts have no real email, so "Forgot password" won't work for them.
          </p>
        </Section>

        <Section id="billing" icon={CreditCard} title="Billing">
          <p>
            Manage your plan and payment method from the <strong>Billing</strong> page in the
            sidebar (owners and admins only). If your trial ends, the app switches to read-only. You
            keep every record, but need to upgrade to keep creating or editing.
          </p>
        </Section>
      </div>
    </AppShell>
  );
}
