// Pure pricing helpers. Margin ≠ markup — keep them straight (this was a real
// bug once). Centralised here so the proposal builder and tests share one source.
//   sellPrice(cost, markup)  = round(cost × (1 + markup/100), 2)
//   markupForMargin(30)      ≈ 42.9   (a 30% margin needs a 30/70 markup on cost)
//   marginForMarkup(43)      ≈ 30
export const sellPrice = (cost: number, markup: number) =>
  Math.round(cost * (1 + markup / 100) * 100) / 100;

export const markupForMargin = (m: number) =>
  m >= 95 ? 1900 : Math.round((m / (100 - m)) * 1000) / 10;

export const marginForMarkup = (mk: number) =>
  Math.round((mk / (100 + mk)) * 100);
