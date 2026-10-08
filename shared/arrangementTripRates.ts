import { z } from "zod";

export const arrangementTripRateSchema = z.object({
  quantity: z.number({ invalid_type_error: "Enter a valid trip quantity." }).finite().positive("Trip quantity must be greater than zero."),
  uom: z.string().trim().min(1, "Trip UOM is required.").transform(value => value.toUpperCase()),
  rate: z.number({ invalid_type_error: "Enter a valid rate per trip." }).finite().min(0, "Rate per trip cannot be negative."),
}).strict();

export const arrangementTripRatesSchema = z.array(arrangementTripRateSchema)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const key = JSON.stringify([row.quantity, row.uom]);
      if (seen.has(key)) ctx.addIssue({
        code: z.ZodIssueCode.custom, path: [index],
        message: `Duplicate trip size: ${row.quantity} ${row.uom}. Enter one rate for each trip size and UOM.`,
      });
      seen.add(key);
    });
  }).nullable().transform(rows => rows?.length ? rows : null);

export type ArrangementTripRate = z.infer<typeof arrangementTripRateSchema>;
