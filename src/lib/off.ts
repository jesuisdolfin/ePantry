// src/lib/off.ts

export type OFFProduct = {
  code: string;              // barcode
  product?: {
    product_name?: string;
    brands?: string;         // e.g. "Goya"
    quantity?: string;       // e.g. "425 g"
    image_small_url?: string;
  };
  status?: 0 | 1;
  status_verbose?: string;
};

const OFF_BASE = "https://world.openfoodfacts.org";

/** OFF often uses EAN-13; for UPC-A (12 digits) we can try both raw and with a leading 0 */
export function normalizeForOFF(upc: string): string[] {
  const s = upc.trim();
  if (/^\d{12}$/.test(s)) return [s, "0" + s]; // try UPC-A + EAN-13 variant
  return [s];
}

export async function fetchOFFByBarcode(upc: string, signal?: AbortSignal) {
  const candidates = normalizeForOFF(upc);
  for (const code of candidates) {
    // OFF v2 preferred; falls back nicely
    const url = `${OFF_BASE}/api/v2/product/${code}.json`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = (await res.json()) as OFFProduct;
      if (data?.status === 1 && data.product) {
        const name = data.product.product_name?.trim();
        const brands = data.product.brands?.trim();
        const size = data.product.quantity?.trim();
        const image = data.product.image_small_url?.trim();
        return {
          code: data.code,
          name: name || undefined,
          brand: brands || undefined,
          size: size || undefined,
          imageUrl: image || undefined,
        };
      }
    } catch {
      // network/abort -> try next candidate
    }
  }
  return null;
}
