/** Client-only QR PNG data URLs for shareable links (team invites, staff sign-in). */

export async function qrPngDataUrl(text: string, size = 220): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(text, {
    type: "image/png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
