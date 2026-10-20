/** Mirrors storefront delivery pricing in the database. Checkout does not
 * trust this result — quote_store_cart / create_store_order recompute it. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function deliveryFee(input: {
  fulfilment: "pickup" | "delivery" | "quote";
  subtotal: number;
  flatFee: number;
  freeOver: number | null;
}): number {
  if (input.fulfilment !== "delivery") return 0;
  const fee = Math.max(input.flatFee, 0);
  if (input.freeOver != null && input.subtotal >= input.freeOver) return 0;
  return roundMoney(fee);
}

export function orderTotal(input: { subtotal: number; tax: number; deliveryFee: number }): number {
  return roundMoney(input.subtotal + input.tax + input.deliveryFee);
}
