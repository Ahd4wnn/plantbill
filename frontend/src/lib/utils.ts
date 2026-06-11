/**
 * Formats a numeric value or string amount into Indian Rupees (₹)
 * with correct lakhs and crores groupings.
 * Example: 125000 -> ₹1,25,000.00
 */
export const formatRupees = (amount: number | string): string => {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '₹0.00';
  
  return '₹' + numericAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
