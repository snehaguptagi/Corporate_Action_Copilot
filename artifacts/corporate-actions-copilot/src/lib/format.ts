export function formatInr(amount: number): string {
  const absolute = Math.abs(amount);
  if (absolute >= 10_000_000) {
    return `₹${(amount / 10_000_000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cr`;
  }
  if (absolute >= 100_000) {
    return `₹${(amount / 100_000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lakh`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}