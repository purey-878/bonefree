import {
  adminDataPrivacyCancelExport,
  adminDataPrivacyCreateCustomerExport,
  adminDataPrivacyCreateTenantExport,
  adminDataPrivacyDownloadExport,
  adminDataPrivacyListExports,
  adminDataPrivacyReadOverview,
  adminDataPrivacyRegenerateExport,
  siteSettingsReadAdminOrganizationProfile,
  siteSettingsUpdateAdminOrganizationProfile,
} from '../api/generated'
import type {
  DataExportResponse,
  DataExportKind,
  OrganizationProfileResponse,
  PrivacyOverviewResponse,
} from '../api/generated'
import { adminApiClient, apiData } from '../api/clients'

export type {
  DataExportKind,
  DataExportResponse,
  PrivacyOverviewResponse,
} from '../api/generated'

export type OrganizationDataExportKind = Exclude<DataExportKind, 'customer'>


export async function getPrivacyOverview(): Promise<PrivacyOverviewResponse> {
  return apiData(adminDataPrivacyReadOverview({ client: adminApiClient, throwOnError: true }))
}

export async function listDataExports(): Promise<DataExportResponse[]> {
  return (await apiData(adminDataPrivacyListExports({ client: adminApiClient, throwOnError: true }))).items
}

export async function createOrganizationDataExport(kind: OrganizationDataExportKind): Promise<DataExportResponse> {
  return apiData(adminDataPrivacyCreateTenantExport({
    body: { kind },
    client: adminApiClient,
    throwOnError: true,
  }))
}

export async function createCustomerDataExport(customerId: number): Promise<DataExportResponse> {
  return apiData(adminDataPrivacyCreateCustomerExport({
    path: { customer_id: customerId },
    client: adminApiClient,
    throwOnError: true,
  }))
}

export async function regenerateDataExport(exportId: string): Promise<DataExportResponse> {
  return apiData(adminDataPrivacyRegenerateExport({
    path: { export_id: exportId },
    client: adminApiClient,
    throwOnError: true,
  }))
}

export async function cancelDataExport(exportId: string): Promise<DataExportResponse> {
  return apiData(adminDataPrivacyCancelExport({
    path: { export_id: exportId },
    client: adminApiClient,
    throwOnError: true,
  }))
}

export async function downloadDataExport(exportItem: DataExportResponse): Promise<void> {
  const blob = await apiData(adminDataPrivacyDownloadExport({
    path: { export_id: exportItem.export_id },
    client: adminApiClient,
    throwOnError: true,
  }))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportItem.file_name || `data-export-${exportItem.export_id}.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function getPrivacyProfile(): Promise<OrganizationProfileResponse> {
  return apiData(siteSettingsReadAdminOrganizationProfile({
    client: adminApiClient,
    throwOnError: true,
  }))
}

export async function updatePrivacyContact(email: string): Promise<OrganizationProfileResponse> {
  return apiData(siteSettingsUpdateAdminOrganizationProfile({
    body: { privacy_contact_email: email.trim() || null },
    client: adminApiClient,
    throwOnError: true,
  }))
}
