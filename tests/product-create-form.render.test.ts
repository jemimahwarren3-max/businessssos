import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ProductCreateForm } from "@/components/product-create-form";

describe("ProductCreateForm", () => {
  it("renders the add product form without form-context errors", () => {
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(ProductCreateForm, {
          currency: "USD",
          suppliers: [],
          categories: [{ id: "c1", name: "Groceries" }],
          pending: false,
          onCancel: () => {},
          onSubmit: () => {},
        }),
      ),
    );
    expect(html).toContain("Product name");
    expect(html).toContain("Photo (optional)");
  });
});
