import { Link } from "@tanstack/react-router";
import { Boxes, FileUp, Receipt, ShoppingCart, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const OPTIONS = [
  {
    label: "Products & stock",
    help: "Add products or update stock levels.",
    to: "/inventory",
    icon: Boxes,
  },
  {
    label: "Record a sale",
    help: "Open the Sales Counter and take a sale.",
    to: "/sales",
    icon: ShoppingCart,
  },
  {
    label: "Past sales",
    help: "Import sales you made before using Kwetuu.",
    to: "/sale-history",
    icon: FileUp,
  },
  {
    label: "Expenses",
    help: "Record an expense, or import past expenses.",
    to: "/expenses",
    icon: Receipt,
  },
  {
    label: "Import files",
    help: "Upload a CSV or Excel file. You check it before anything is saved.",
    to: "/settings/data",
    icon: FileUp,
  },
] as const;

export function QuickAddMenu({
  open,
  onOpenChange,
  onTypeNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeNote: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>What would you like to add?</DialogTitle>
          <DialogDescription>Pick one. Nothing is saved until you confirm it.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {OPTIONS.map((option) => (
            <li key={option.label}>
              <Link
                to={option.to}
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted"
              >
                <option.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-[13px] text-muted-foreground">{option.help}</span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={onTypeNote}
              className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
            >
              <Wand2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">Type a quick note</span>
                <span className="block text-[13px] text-muted-foreground">
                  Describe a sale or expense in plain words and review it first.
                </span>
              </span>
            </button>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
