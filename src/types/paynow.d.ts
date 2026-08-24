// The "paynow" package (v2.2.2) ships no type declarations — this covers
// only the surface we actually use, hand-written against the installed
// package's real compiled source (node_modules/paynow/dist/paynow.js),
// not the README (which documents a `StatusResponse.paid()` helper and a
// `pollTransaction()` that returns transaction status — neither exists in
// the shipped code; pollTransaction() actually reuses the InitResponse
// parser, which has no status semantics. We deliberately avoid both and
// verify payments via parseStatusUpdate() instead — see paynow.server.ts.
declare module "paynow" {
  export class Payment {
    reference: string;
    authEmail: string | undefined;
    add(title: string, amount: number, quantity?: number): this;
    total(): number;
  }

  export class InitResponse {
    status: string;
    success: boolean;
    hasRedirect: boolean;
    isInnbucks: boolean;
    pollUrl?: string;
    redirectUrl?: string;
    instructions?: string;
    error?: string;
  }

  export class StatusResponse {
    reference?: string;
    amount?: string;
    paynowReference?: string;
    pollUrl?: string;
    status?: string;
    error?: string;
  }

  export class Paynow {
    constructor(
      integrationId: string,
      integrationKey: string,
      resultUrl?: string,
      returnUrl?: string,
    );
    resultUrl: string | undefined;
    returnUrl: string | undefined;
    createPayment(reference: string, authEmail?: string): Payment;
    send(payment: Payment): Promise<InitResponse | undefined>;
    sendMobile(
      payment: Payment,
      phone: string,
      method: "ecocash" | "onemoney",
    ): Promise<InitResponse | undefined>;
    // Verifies the SHA512 hash on a raw (already-fetched) response body —
    // safe to use on both the resulturl webhook body and a manual poll of
    // the stored pollUrl. Throws if the hash doesn't match.
    parseStatusUpdate(rawBody: string): StatusResponse;
  }
}
