export function paymentHowLabel(method: string, paid: boolean): string {
  if (method === "paynow") {
    return paid ? "Paid with Paynow (EcoCash / card)." : "Paynow — waiting for payment.";
  }
  if (method === "pay_on_delivery") {
    return paid ? "Cash on delivery recorded." : "Pay cash on delivery. Not paid yet.";
  }
  if (method === "quote") {
    return paid
      ? "Quoted order — payment recorded."
      : "Quote request. Price is not final until the shop confirms.";
  }
  if (method === "manual") {
    return paid
      ? "Manual payment recorded by the shop after they checked their account."
      : "Pay using this shop's instructions. A payment note is not a confirmed payment.";
  }
  return paid ? "Cash on collection recorded." : "Pay cash on collection. Not paid yet.";
}

export function fulfilmentHowLabel(method: string): string {
  if (method === "delivery") return "Local delivery";
  if (method === "quote") return "Quote";
  return "Collect in store";
}
