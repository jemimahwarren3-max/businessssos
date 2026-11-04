import { z } from "zod";
import { commerceModelSchema } from "./commerce-model";

export const servicePricingTypeSchema = z.enum(["fixed", "quote"]);
export const bookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);
export const serviceRequestStatusSchema = z.enum([
  "pending",
  "quoted",
  "accepted",
  "declined",
  "converted",
]);

export const serviceSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Service name is required").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price cannot be negative").max(99999999).default(0),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
  pricingType: servicePricingTypeSchema.default("fixed"),
  requiresBooking: z.boolean().default(true),
  published: z.boolean().default(false),
  isActive: z.boolean().default(true),
  staffMemberIds: z.array(z.string().uuid()).max(40).default([]),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const updateServiceSchema = serviceSchema.extend({
  serviceId: z.string().uuid(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const serviceIdSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export const listServicesSchema = z.object({
  businessId: z.string().uuid(),
  includeArchived: z.boolean().default(false),
});

export const setCommerceModelSchema = z.object({
  businessId: z.string().uuid(),
  commerceModel: commerceModelSchema,
});

export const weekdayHoursSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  isClosed: z.boolean().default(false),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
    .default("09:00"),
  closeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
    .default("17:00"),
});

export const saveBusinessHoursSchema = z.object({
  businessId: z.string().uuid(),
  autoConfirmBookings: z.boolean().default(false),
  hours: z.array(weekdayHoursSchema).length(7),
});

export const saveStaffHoursSchema = z.object({
  businessId: z.string().uuid(),
  memberId: z.string().uuid(),
  hours: z.array(weekdayHoursSchema).max(7),
});

export const bookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  memberId: z.string().uuid().optional().or(z.literal("")),
  customerId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().trim().min(1, "Customer name is required").max(160),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  customerEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  startsAt: z.string().min(1, "Pick a start time"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  source: z.enum(["walk_in", "phone", "online", "pos"]).default("walk_in"),
});
export type BookingInput = z.infer<typeof bookingSchema>;

export const listBookingsSchema = z.object({
  businessId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: bookingStatusSchema.optional(),
});

export const setBookingStatusSchema = z.object({
  businessId: z.string().uuid(),
  bookingId: z.string().uuid(),
  status: bookingStatusSchema,
});

export const rescheduleBookingSchema = z.object({
  businessId: z.string().uuid(),
  bookingId: z.string().uuid(),
  startsAt: z.string().min(1),
  memberId: z.string().uuid().optional().or(z.literal("")),
});

export const listBookingSlotsSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  memberId: z.string().uuid().optional().or(z.literal("")),
});

export const publicBookingSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  serviceId: z.string().uuid(),
  startsAt: z.string().min(1),
  memberId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().trim().min(1, "Your name is required").max(160),
  customerPhone: z.string().trim().min(5, "Phone is required").max(40),
  customerEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const publicServiceRequestSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  serviceId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().trim().min(1, "Your name is required").max(160),
  customerPhone: z.string().trim().min(5, "Phone is required").max(40),
  customerEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  description: z.string().trim().min(4, "Describe what you need").max(2000),
  preferredDate: z.string().optional().or(z.literal("")),
});

export const listServiceRequestsSchema = z.object({
  businessId: z.string().uuid(),
});

export const setServiceRequestStatusSchema = z.object({
  businessId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: serviceRequestStatusSchema,
});

export const uploadServiceImageSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export const serviceReportsSchema = z.object({
  businessId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const getStaffHoursSchema = z.object({
  businessId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const saveClosuresSchema = z.object({
  businessId: z.string().uuid(),
  dates: z
    .array(
      z.object({
        closedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
        reason: z.string().trim().max(160).optional().or(z.literal("")),
      }),
    )
    .max(60),
});
