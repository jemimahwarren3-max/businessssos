import { createServerFn } from "@tanstack/react-start";
import { parseAndSanitize } from "./security";
import { authedRateLimit, ipRateLimit } from "./rate-limit.server";
import { type Db } from "./business.server";
import {
  archiveService,
  createBooking,
  createService,
  getBookingSettings,
  getServiceReports,
  getStaffHours,
  listBookingSlots,
  listBookings,
  listPublicBookingSlots,
  listServiceRequests,
  listServices,
  loadPublicServices,
  requestPublicBooking,
  rescheduleBooking,
  saveBusinessClosures,
  saveBusinessHours,
  saveStaffHours,
  setBookingStatus,
  setCommerceModel,
  setServiceRequestStatus,
  submitPublicServiceRequest,
  updateService,
  uploadServiceImage,
} from "./services.server";
import {
  bookingSchema,
  listBookingSlotsSchema,
  listBookingsSchema,
  listServiceRequestsSchema,
  getStaffHoursSchema,
  listServicesSchema,
  publicBookingSchema,
  publicServiceRequestSchema,
  rescheduleBookingSchema,
  saveBusinessHoursSchema,
  saveClosuresSchema,
  saveStaffHoursSchema,
  serviceIdSchema,
  serviceReportsSchema,
  serviceSchema,
  setBookingStatusSchema,
  setCommerceModelSchema,
  setServiceRequestStatusSchema,
  updateServiceSchema,
} from "./services.schemas";
import { z } from "zod";

const authAndRateLimit = [
  authedRateLimit({ keyPrefix: "businessos-api", maxRequests: 120, windowSeconds: 60 }),
] as const;

const publicLimit = [
  ipRateLimit({ keyPrefix: "service-public", maxRequests: 40, windowSeconds: 60 }),
] as const;

export const listServicesFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listServicesSchema, data))
  .handler(async ({ data, context }) =>
    listServices(context.supabase as Db, data.businessId, data.includeArchived),
  );

export const createServiceFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(serviceSchema, data))
  .handler(async ({ data, context }) => createService(context.supabase as Db, data));

export const updateServiceFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(updateServiceSchema, data))
  .handler(async ({ data, context }) => {
    await updateService(context.supabase as Db, data);
    return { ok: true as const };
  });

export const archiveServiceFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(serviceIdSchema, data))
  .handler(async ({ data, context }) => {
    await archiveService(context.supabase as Db, data.businessId, data.serviceId);
    return { ok: true as const };
  });

function parseServicePhotoForm(data: unknown): {
  businessId: string;
  serviceId: string;
  file: File;
} {
  if (!(data instanceof FormData)) {
    throw new Error("Choose a photo.");
  }
  const businessId = String(data.get("businessId") ?? "");
  const serviceId = String(data.get("serviceId") ?? "");
  const file = data.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
    throw new Error("That service could not be found.");
  }
  if (!(file instanceof File)) {
    throw new Error("Choose a photo.");
  }
  return { businessId, serviceId, file };
}

export const uploadServiceImageFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseServicePhotoForm(data))
  .handler(async ({ data, context }) =>
    uploadServiceImage(context.supabase as Db, data.businessId, data.serviceId, data.file),
  );

export const listBookingsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listBookingsSchema, data))
  .handler(async ({ data, context }) =>
    listBookings(context.supabase as Db, data.businessId, data.from, data.to, data.status),
  );

export const createBookingFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(bookingSchema, data))
  .handler(async ({ data, context }) => createBooking(context.supabase as Db, data));

export const setBookingStatusFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setBookingStatusSchema, data))
  .handler(async ({ data, context }) => {
    await setBookingStatus(context.supabase as Db, data.businessId, data.bookingId, data.status);
    return { ok: true as const };
  });

export const rescheduleBookingFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(rescheduleBookingSchema, data))
  .handler(async ({ data, context }) => {
    await rescheduleBooking(
      context.supabase as Db,
      data.businessId,
      data.bookingId,
      data.startsAt,
      data.memberId,
    );
    return { ok: true as const };
  });

export const listBookingSlotsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listBookingSlotsSchema, data))
  .handler(async ({ data, context }) =>
    listBookingSlots(
      context.supabase as Db,
      data.businessId,
      data.serviceId,
      data.on,
      data.memberId,
    ),
  );

export const getBookingSettingsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    getBookingSettings(context.supabase as Db, data.businessId),
  );

export const saveBusinessHoursFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(saveBusinessHoursSchema, data))
  .handler(async ({ data, context }) => {
    await saveBusinessHours(
      context.supabase as Db,
      data.businessId,
      data.autoConfirmBookings,
      data.hours,
    );
    return { ok: true as const };
  });

export const saveStaffHoursFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(saveStaffHoursSchema, data))
  .handler(async ({ data, context }) => {
    await saveStaffHours(context.supabase as Db, data.businessId, data.memberId, data.hours);
    return { ok: true as const };
  });

export const setCommerceModelFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setCommerceModelSchema, data))
  .handler(async ({ data, context }) => {
    await setCommerceModel(context.supabase as Db, data.businessId, data.commerceModel);
    return { ok: true as const };
  });

export const listServiceRequestsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listServiceRequestsSchema, data))
  .handler(async ({ data, context }) =>
    listServiceRequests(context.supabase as Db, data.businessId),
  );

export const setServiceRequestStatusFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setServiceRequestStatusSchema, data))
  .handler(async ({ data, context }) => {
    await setServiceRequestStatus(
      context.supabase as Db,
      data.businessId,
      data.requestId,
      data.status,
    );
    return { ok: true as const };
  });

export const getServiceReportsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(serviceReportsSchema, data))
  .handler(async ({ data, context }) =>
    getServiceReports(context.supabase as Db, data.businessId, data.days),
  );

export const loadPublicServicesFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ slug: z.string().min(1).max(80) }), data),
  )
  .handler(async ({ data }) => loadPublicServices(data.slug));

export const listPublicBookingSlotsFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(1).max(80),
        serviceId: z.string().uuid(),
        on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        memberId: z.string().uuid().optional().or(z.literal("")),
      }),
      data,
    ),
  )
  .handler(async ({ data }) =>
    listPublicBookingSlots(data.slug, data.serviceId, data.on, data.memberId),
  );

export const requestPublicBookingFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) => parseAndSanitize(publicBookingSchema, data))
  .handler(async ({ data }) => requestPublicBooking(data));

export const submitPublicServiceRequestFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) => parseAndSanitize(publicServiceRequestSchema, data))
  .handler(async ({ data }) => submitPublicServiceRequest(data));

export const getStaffHoursFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(getStaffHoursSchema, data))
  .handler(async ({ data, context }) =>
    getStaffHours(context.supabase as Db, data.businessId, data.memberId),
  );

export const saveBusinessClosuresFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(saveClosuresSchema, data))
  .handler(async ({ data, context }) => {
    await saveBusinessClosures(context.supabase as Db, data.businessId, data.dates);
    return { ok: true as const };
  });
