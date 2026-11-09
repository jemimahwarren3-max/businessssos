import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const PAGES: { label: string; to: string; keywords: string }[] = [
  { label: "Home", to: "/dashboard", keywords: "dashboard today" },
  { label: "Sales & POS", to: "/sales", keywords: "sell counter cart" },
  { label: "Products & inventory", to: "/inventory", keywords: "stock products" },
  { label: "Online orders", to: "/online-orders", keywords: "shop orders fulfilment" },
  { label: "Reports", to: "/reports", keywords: "profit sales import history" },
  { label: "Expenses", to: "/expenses", keywords: "costs" },
  { label: "Customers", to: "/customers", keywords: "debtors" },
  { label: "Online store", to: "/storefront", keywords: "website publish" },
  { label: "Import & download data", to: "/settings/data", keywords: "export excel csv" },
  { label: "Help guide", to: "/help", keywords: "how to quick add keyboard" },
  { label: "Cash in till (optional)", to: "/cash-drawer", keywords: "float count" },
];

export function AppNavigator() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and tools…" />
      <CommandList>
        <CommandEmpty>No match. Try sales, inventory, import, or help.</CommandEmpty>
        <CommandGroup heading="Go to">
          {PAGES.map((page) => (
            <CommandItem
              key={page.to}
              value={`${page.label} ${page.keywords}`}
              onSelect={() => {
                setOpen(false);
                void navigate({ to: page.to });
              }}
            >
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tips">
          <CommandItem
            value="quick add ai file upload header"
            onSelect={() => {
              setOpen(false);
              void navigate({ to: "/help", hash: "quick-add" });
            }}
          >
            Quick add: type a note or attach a CSV/Excel file
          </CommandItem>
          <CommandItem value="keyboard shortcut search" onSelect={() => setOpen(false)}>
            Press Ctrl+K (⌘K on Mac) anytime to open this search
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
