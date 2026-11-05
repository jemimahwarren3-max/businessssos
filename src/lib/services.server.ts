import type { Json } from "@/integrations/supabase/types";
import { createAnonClient } from "@/lib/auth/session.server";
import { AppError, assertCanWrite, assertPermission, dbFail, type Db } from "./business.server";
import type { BookingInput, ServiceInput, UpdateServiceInput } from "./services.schemas";
import {
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  extensionForKind,
  sniffProductImage,
} from "./product-media";

async function untypedRpc(
  client: Db,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: Json | null; error: { message?: string } | null }> {
  return (await (
    client.rpc as unknown as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Json | null; error: { message?: string } | null }>
  )(fn, args)) as { data: Json | null; error: { message?: string } | null };
}

function rpcData<T>(
  context: string,
  result: { data: Json | null; error: { message?: string } | null },
): T {
  if (result.error) dbFail(context, result.error);
  return result.data as T;
}

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  price: number;
  durationMinutes: number;
  imageUrl: string | null;
  pricingType: "fixed" | "quote";
  requiresBooking: boolean;
  published: boolean;
  isActive: boolean;
  deletedAt: string | null;
  staffMemberIds: string[];
};

export type BookingRow = {
  id: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  memberId: string | null;
  staffName: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  notes: string | null;
  saleId: string | null;
};

export type ServiceRequestRow = {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  description: string;
  preferredDate: string | null;
  status: string;
  createdAt: string;
};

export type BookingSettings = {
  commerceModel: string;
  autoConfirmBookings: boolean;
  hours: { weekday: number; isClosed: boolean; openTime: string; closeTime: string }[];
  closures: { closedOn: string; reason: string }[];
};

export type ServiceReports = {
  serviceRevenue: number;
  bookingCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  outstanding: number;
  popularServices: { name: string; count: number; revenue: number }[];
  revenueByStaff: { name: string; count: number; revenue: number }[];
  trends: { label: string; count: number }[];
};

export type PublicService = {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  imageUrl: string | null;
  pricingType: "fixed" | "quote";
  requiresBooking: boolean;
  categoryId: string | null;
  categoryName: string | null;
};

export async function listServices(
  supabase: Db,
  businessId: string,
  includeArchived = false,
): Promise<ServiceRow[]> {
  const result = await untypedRpc(supabase, "list_services", {
    _business_id: businessId,
    _include_archived: includeArchived,
  });
  return rpcData("list services", result) ?? [];
}

export async function createService(supabase: Db, input: ServiceInput): Promise<{ id: string }> {
  await assertPermission(supabase, input.businessId, "services.manage");
  const result = await untypedRpc(supabase, "create_service", {
    _business_id: input.businessId,
    _name: input.name,
    _description: input.description || null,
    _category_id: input.categoryId || null,
    _price: input.price,
    _duration_minutes: input.durationMinutes,
    _pricing_type: input.pricingType,
    _requires_booking: input.requiresBooking,
    _published: input.published,
    _staff_member_ids: input.staffMemberIds,
  });
  const id = rpcData<string>("create service", result);
  return { id };
}

export async function updateService(supabase: Db, input: UpdateServiceInput): Promise<void> {
  await assertPermission(supabase, input.businessId, "services.manage");
  const result = await untypedRpc(supabase, "update_service", {
    _business_id: input.businessId,
    _service_id: input.serviceId,
    _name: input.name,
    _description: input.description || null,
    _category_id: input.categoryId || null,
    _price: input.price,
    _duration_minutes: input.durationMinutes,
    _pricing_type: input.pricingType,
    _requires_booking: input.requiresBooking,
    _published: input.published,
    _is_active: input.isActive,
    _staff_member_ids: input.staffMemberIds,
  });
  if (result.error) dbFail("update service", result.error);
}

export async function archiveService(
  supabase: Db,
  businessId: string,
  serviceId: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "services.manage");
  const result = await untypedRpc(supabase, "archive_service", {
    _business_id: businessId,
    _service_id: serviceId,
  });
  if (result.error) dbFail("archive service", result.error);
}

export async function uploadServiceImage(
  supabase: Db,
  businessId: string,
  serviceId: string,
  file: File,
): Promise<{ imageUrl: string }> {
  await assertCanWrite(supabase, businessId);
  if (file.size <= 0 || file.size > PRODUCT_MEDIA_MAX_BYTES) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffProductImage(bytes, file.type);
  if (!kind) {
    throw new AppError("Use a JPEG, PNG, or WebP photo under 2 MB.");
  }
  const path = `${businessId}/services/${serviceId}/${crypto.randomUUID()}.${extensionForKind(kind)}`;
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: kind, upsert: false });
  if (uploadError) {
    console.error("[kwetuu] service photo upload", uploadError);
    throw new AppError("Couldn't save that photo. Please try again.");
  }
  const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  const result = await untypedRpc(supabase, "set_service_image", {
    _business_id: businessId,
    _service_id: serviceId,
    _image_url: data.publicUrl,
  });
  if (result.error) dbFail("set service photo", result.error);
  return { imageUrl: data.publicUrl };
}

export async function listBookings(
  supabase: Db,
  businessId: string,
  from?: string,
  to?: string,
  status?: string,
): Promise<BookingRow[]> {
  const result = await untypedRpc(supabase, "list_bookings", {
    _business_id: businessId,
    _from: from || null,
    _to: to || null,
    _status: status || null,
  });
  return rpcData("list bookings", result) ?? [];
}

export async function createBooking(supabase: Db, input: BookingInput): Promise<{ id: string }> {
  await assertPermission(supabase, input.businessId, "bookings.manage");
  const result = await untypedRpc(supabase, "create_booking", {
    _business_id: input.businessId,
    _service_id: input.serviceId,
    _member_id: input.memberId || null,
    _customer_id: input.customerId || null,
    _customer_name: input.customerName,
    _customer_phone: input.customerPhone || null,
    _customer_email: input.customerEmail || null,
    _starts_at: input.startsAt,
    _notes: input.notes || null,
    _source: input.source,
  });
  return { id: rpcData<string>("create booking", result) };
}

export async function setBookingStatus(
  supabase: Db,
  businessId: string,
  bookingId: string,
  status: string,
): Promise<void> {
  const result = await untypedRpc(supabase, "set_booking_status", {
    _business_id: businessId,
    _booking_id: bookingId,
    _status: status,
  });
  if (result.error) dbFail("update booking", result.error);
}

export async function rescheduleBooking(
  supabase: Db,
  businessId: string,
  bookingId: string,
  startsAt: string,
  memberId?: string,
): Promise<void> {
  const result = await untypedRpc(supabase, "reschedule_booking", {
    _business_id: businessId,
    _booking_id: bookingId,
    _starts_at: startsAt,
    _member_id: memberId || null,
  });
  if (result.error) dbFail("reschedule booking", result.error);
}

export async function listBookingSlots(
  supabase: Db,
  businessId: string,
  serviceId: string,
  on: string,
  memberId?: string,
): Promise<string[]> {
  const result = await untypedRpc(supabase, "list_booking_slots", {
    _business_id: businessId,
    _service_id: serviceId,
    _on: on,
    _member_id: memberId || null,
  });
  return rpcData("list booking slots", result) ?? [];
}

export async function getBookingSettings(
  supabase: Db,
  businessId: string,
): Promise<BookingSettings> {
  const result = await untypedRpc(supabase, "get_booking_settings", { _business_id: businessId });
  const data = rpcData<Partial<BookingSettings>>("load booking settings", result);
  return {
    commerceModel: data.commerceModel ?? "products",
    autoConfirmBookings: data.autoConfirmBookings ?? false,
    hours: data.hours ?? [],
    closures: data.closures ?? [],
  };
}

export async function saveBusinessHours(
  supabase: Db,
  businessId: string,
  autoConfirmBookings: boolean,
  hours: { weekday: number; isClosed: boolean; openTime: string; closeTime: string }[],
): Promise<void> {
  const result = await untypedRpc(supabase, "save_business_hours", {
    _business_id: businessId,
    _auto_confirm: autoConfirmBookings,
    _hours: hours.map((row) => ({
      weekday: row.weekday,
      isClosed: row.isClosed,
      openTime: row.openTime,
      closeTime: row.closeTime,
    })),
  });
  if (result.error) dbFail("save business hours", result.error);
}

export async function saveStaffHours(
  supabase: Db,
  businessId: string,
  memberId: string,
  hours: { weekday: number; isClosed: boolean; openTime: string; closeTime: string }[],
): Promise<void> {
  const result = await untypedRpc(supabase, "save_staff_hours", {
    _business_id: businessId,
    _member_id: memberId,
    _hours: hours,
  });
  if (result.error) dbFail("save staff hours", result.error);
}

export async function getStaffHours(
  supabase: Db,
  businessId: string,
  memberId: string,
): Promise<{ weekday: number; isClosed: boolean; openTime: string; closeTime: string }[]> {
  const result = await untypedRpc(supabase, "get_staff_hours", {
    _business_id: businessId,
    _member_id: memberId,
  });
  return rpcData("load staff hours", result) ?? [];
}

export async function saveBusinessClosures(
  supabase: Db,
  businessId: string,
  dates: { closedOn: string; reason?: string | undefined }[],
): Promise<void> {
  const result = await untypedRpc(supabase, "save_business_closures", {
    _business_id: businessId,
    _dates: dates.map((row) => ({ closedOn: row.closedOn, reason: row.reason || "" })),
  });
  if (result.error) dbFail("save closed days", result.error);
}

export async function setCommerceModel(
  supabase: Db,
  businessId: string,
  commerceModel: string,
): Promise<void> {
  const result = await untypedRpc(supabase, "set_commerce_model", {
    _business_id: businessId,
    _model: commerceModel,
  });
  if (result.error) dbFail("set commerce model", result.error);
}

export async function listServiceRequests(
  supabase: Db,
  businessId: string,
): Promise<ServiceRequestRow[]> {
  const result = await untypedRpc(supabase, "list_service_requests", { _business_id: businessId });
  return rpcData("list service requests", result) ?? [];
}

export async function setServiceRequestStatus(
  supabase: Db,
  businessId: string,
  requestId: string,
  status: string,
): Promise<void> {
  const result = await untypedRpc(supabase, "set_service_request_status", {
    _business_id: businessId,
    _request_id: requestId,
    _status: status,
  });
  if (result.error) dbFail("update service request", result.error);
}

export async function getServiceReports(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<ServiceReports> {
  const result = await untypedRpc(supabase, "get_service_reports", {
    _business_id: businessId,
    _days: days,
  });
  const data = rpcData<Partial<ServiceReports>>("load service reports", result);
  return {
    serviceRevenue: Number(data.serviceRevenue ?? 0),
    bookingCount: Number(data.bookingCount ?? 0),
    completedCount: Number(data.completedCount ?? 0),
    cancelledCount: Number(data.cancelledCount ?? 0),
    noShowCount: Number(data.noShowCount ?? 0),
    outstanding: Number(data.outstanding ?? 0),
    popularServices: data.popularServices ?? [],
    revenueByStaff: data.revenueByStaff ?? [],
    trends: data.trends ?? [],
  };
}

export async function loadPublicServices(slug: string): Promise<PublicService[]> {
  const result = await untypedRpc(
    createAnonClient() as unknown as Db,
    "get_public_store_services",
    {
      _slug: slug,
    },
  );
  if (result.error) dbFail("load public store services", result.error);
  return (result.data as PublicService[]) ?? [];
}

export async function requestPublicBooking(input: {
  slug: string;
  serviceId: string;
  startsAt: string;
  memberId?: string | undefined;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | undefined;
  notes?: string | undefined;
}): Promise<{ id: string }> {
  const result = await untypedRpc(createAnonClient() as unknown as Db, "request_public_booking", {
    _slug: input.slug,
    _service_id: input.serviceId,
    _starts_at: input.startsAt,
    _customer_name: input.customerName,
    _customer_phone: input.customerPhone,
    _customer_email: input.customerEmail || null,
    _notes: input.notes || null,
    _member_id: input.memberId || null,
  });
  return { id: rpcData<string>("request booking", result) };
}

export async function submitPublicServiceRequest(input: {
  slug: string;
  serviceId?: string | undefined;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | undefined;
  description: string;
  preferredDate?: string | undefined;
}): Promise<{ id: string }> {
  const result = await untypedRpc(createAnonClient() as unknown as Db, "submit_service_request", {
    _slug: input.slug,
    _service_id: input.serviceId || null,
    _customer_name: input.customerName,
    _customer_phone: input.customerPhone,
    _customer_email: input.customerEmail || null,
    _description: input.description,
    _preferred_date: input.preferredDate || null,
  });
  return { id: rpcData<string>("submit service request", result) };
}

export async function listPublicBookingSlots(
  slug: string,
  serviceId: string,
  on: string,
  memberId?: string,
): Promise<string[]> {
  const result = await untypedRpc(
    createAnonClient() as unknown as Db,
    "list_public_booking_slots",
    {
      _slug: slug,
      _service_id: serviceId,
      _on: on,
      _member_id: memberId || null,
    },
  );
  if (result.error) return [];
  return (result.data as string[]) ?? [];
}
