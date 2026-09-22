/** Bill types whose recorded cumulative payment must settle before marking paid. */
export const hasCumulativeVendorPayment = (billType: string) =>
  ["equipment", "all"].includes(String(billType || "").toLowerCase());