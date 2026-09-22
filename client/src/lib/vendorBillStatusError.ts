import { parseApiError } from "./apiError";

export function vendorBillStatusError(error: unknown): { title: string; description: string } {
  const { message } = parseApiError(error);
  if ([
    "Record the remaining equipment hire balance before marking this bill paid.",
    "Record the cumulative equipment hire payment before marking this bill paid.",
  ].includes(message)) {
    return {
      title: "Payment balance still outstanding",
      description: "Open Payment Details and save the total amount actually paid in “Paid This Bill (cumulative ₹)”. You can mark this bill as Paid once the recorded payment covers the full net payable.",
    };
  }
  return { title: "Could not update bill status", description: message };
}