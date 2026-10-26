import type { Product, SaleLine } from "./models";

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function calculateSaleLines(items: Array<{ product: Product; quantity: number; unitPrice?: number }>): SaleLine[] {
  return items.map(({ product, quantity, unitPrice = product.unitPrice }) => ({
    id: crypto.randomUUID(), productId: product.id, productCode: product.code,
    productName: product.name, quantity, unitPrice,
    subtotal: roundCurrency(quantity * unitPrice),
  }));
}
export function calculateSaleTotal(lines: Pick<SaleLine, "subtotal">[]): number {
  return roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
}
