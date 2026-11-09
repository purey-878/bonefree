import { apiData, adminApiClient, publicApiClient } from '../api/clients';
import { reservationsAdminList, reservationsAdminSettings, reservationsAvailability, reservationsCancel, reservationsConfirmation, reservationsConfirmationPdf, reservationsCreate, reservationsCreatePromotion, reservationsDeleteException, reservationsListExceptions, reservationsListPromotions, reservationsPurgeExpired, reservationsPublicSettings, reservationsSaveException, reservationsUpdatePromotion, reservationsUpdateSettings, reservationsUpdateStatus } from '../api/generated';
import type { BookingInput, BookingSettings, DateException, PrivateAccess, PromotionInput, ReservationsAdminListData, StatusUpdate } from '../api/generated';
export type { AdminBooking, Award, BookingInput, BookingPage, BookingSettings, DateException, PassResponse, PromotionAdmin, PromotionInput, PublicSettings, SettingsResult, Slot, StatusUpdate } from '../api/generated';

// Responses include server-owned fields such as id. TypeScript structural typing
// does not remove them at runtime, so copy only fields in the write contract.
export function toPromotionInput(source: PromotionInput): PromotionInput {
  const { title, description, scope, conditions, percentage, start_date, end_date, enabled, automatic, weekdays, windows, translations } = source;
  return { title, description, scope, conditions, percentage, start_date, end_date, enabled, automatic, weekdays, windows, translations };
}

export const reservationService = {
  settings: (signal?: AbortSignal) => apiData(reservationsPublicSettings({ client: publicApiClient, throwOnError: true, signal })),
  availability: (day: string, guests: number, locale: PrivateAccess['locale'], signal?: AbortSignal) => apiData(reservationsAvailability({ query: { day, guests, locale }, client: publicApiClient, throwOnError: true, signal })),
  create: (body: BookingInput, locale: PrivateAccess['locale']) => apiData(reservationsCreate({ body, query: { locale }, client: publicApiClient, throwOnError: true })),
  confirmation: (body: PrivateAccess, signal?: AbortSignal) => apiData(reservationsConfirmation({ body, signal, client: publicApiClient, throwOnError: true, cache: 'no-store' })),
  cancel: (body: PrivateAccess) => apiData(reservationsCancel({ body, client: publicApiClient, throwOnError: true, cache: 'no-store' })),
  pdf: (body: PrivateAccess) => apiData(reservationsConfirmationPdf({ body, client: publicApiClient, throwOnError: true, parseAs: 'blob', cache: 'no-store' })),
  list: (query: ReservationsAdminListData['query'], signal?: AbortSignal) => apiData(reservationsAdminList({ query, signal, cache: 'no-store', client: adminApiClient, throwOnError: true })),
  adminSettings: () => apiData(reservationsAdminSettings({ client: adminApiClient, throwOnError: true })),
  saveSettings: (body: BookingSettings) => apiData(reservationsUpdateSettings({ body, client: adminApiClient, throwOnError: true })),
  exceptions: () => apiData(reservationsListExceptions({ client: adminApiClient, throwOnError: true })),
  saveException: (body: DateException) => apiData(reservationsSaveException({ body, client: adminApiClient, throwOnError: true })),
  deleteException: (day: string) => apiData(reservationsDeleteException({ path: { day }, client: adminApiClient, throwOnError: true })),
  promotions: () => apiData(reservationsListPromotions({ client: adminApiClient, throwOnError: true })),
  savePromotion: (source: PromotionInput, id?: number) => {
    const body = toPromotionInput(source);
    return id !== undefined ? apiData(reservationsUpdatePromotion({ path: { promotion_id: id }, body, client: adminApiClient, throwOnError: true })) : apiData(reservationsCreatePromotion({ body, client: adminApiClient, throwOnError: true }));
  },
  status: (id: number, status: StatusUpdate['status']) => apiData(reservationsUpdateStatus({ path: { reservation_id: id }, body: { status }, client: adminApiClient, throwOnError: true })),
  purge: () => apiData(reservationsPurgeExpired({ client: adminApiClient, throwOnError: true })),
};

export function newBookingKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
