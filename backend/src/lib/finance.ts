export function calculateSellingPrice(costPrice: number, grossMarginPct: number): number {
  if (grossMarginPct >= 100) return 0;
  return Math.round((costPrice / (1 - grossMarginPct / 100)) * 100) / 100;
}

export function calculateNetMargin(grossMarginPct: number, donationPct: number): number {
  return grossMarginPct - donationPct;
}

export function calculateOrderLineFinancials(lineItem: {
  price: number;
  quantity: number;
  cost_price: number;
  donation_percentage: number;
}): { line_total: number; line_cost: number; donation_amount: number; profit: number } {
  const line_total = lineItem.price * lineItem.quantity;
  const line_cost = lineItem.cost_price * lineItem.quantity;
  const donation_amount = line_total * (lineItem.donation_percentage / 100);
  const profit = line_total - line_cost - donation_amount;
  return { line_total, line_cost, donation_amount, profit };
}

export function calculateMonthlyPL(
  revenue: number,
  productCost: number,
  otherCosts: number | null
): {
  gross_profit: number;
  net_profit: number | null;
  donation_target: number | null;
  net_after_donations: number | null;
} {
  const gross_profit = revenue - productCost;
  const net_profit = otherCosts !== null ? gross_profit - otherCosts : null;
  const donation_target = net_profit !== null ? net_profit * 0.4 : null;
  const net_after_donations =
    net_profit !== null && donation_target !== null ? net_profit - donation_target : null;
  return { gross_profit, net_profit, donation_target, net_after_donations };
}
