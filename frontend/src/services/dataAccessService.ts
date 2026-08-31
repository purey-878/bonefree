import { createClient } from '../api/generated/client'
import {
  dataAccessCancelExport,
  dataAccessCreateCustomerExport,
  dataAccessCreateTenantExport,
  dataAccessDownloadExport,
  dataAccessListCustomers,
  dataAccessListExports,
  dataAccessReadPrivacyOverview,
  dataAccessReadSession,
  dataAccessRegenerateExport,
  dataAccessRequestLoginCode,
  dataAccessVerifyLoginCode,
} from '../api/generated'
import type {
  CustomerAdminPageResponse,
  DataAccessOtpChallengeResponse,
  DataAccessSessionResponse,
  DataAccessTokenResponse,
  DataExportKind,
  DataExportResponse,
  PrivacyOverviewResponse,
} from '../api/generated'
import { toApiError } from '../api/errors'
import { API_BASE, getStoredToken } from '../api/clients'

export type {
  CustomerAdminResponse,
  DataAccessSessionResponse,
  DataExportResponse,
  PrivacyOverviewResponse,
} from '../api/generated'


const hostname = window.location.hostname.toLowerCase()
const client = createClient({
  baseUrl: API_BASE,
  auth: () => getStoredToken('admin_token'),
  headers: { 'X-Organization-Hostname': hostname },
})
client.interceptors.error.use((error, response) => toApiError(error, response?.status))

const data = async <T,>(request: Promise<{ data: T }>): Promise<T> => (await request).data

export type OrganizationDataExportKind = Exclude<DataExportKind, 'customer'>

export async function requestDataAccessOtp(
  email: string,
  password: string,
): Promise<DataAccessOtpChallengeResponse> {
  return data(dataAccessRequestLoginCode({
    body: { hostname, email, password }, client, throwOnError: true,
  }))
}

export async function verifyDataAccessOtp(
  challengeId: string,
  code: string,
): Promise<DataAccessTokenResponse> {
  return data(dataAccessVerifyLoginCode({
    body: { hostname, challenge_id: challengeId, code }, client, throwOnError: true,
  }))
}

export async function readDataAccessSession(): Promise<DataAccessSessionResponse> {
  return data(dataAccessReadSession({ client, throwOnError: true }))
}

export async function listDataAccessCustomers(page = 1, search = ''): Promise<CustomerAdminPageResponse> {
  return data(dataAccessListCustomers({
    query: { page, per_page: 20, search: search.trim() || undefined },
    client,
    throwOnError: true,
  }))
}

export async function listDataAccessExports(): Promise<DataExportResponse[]> {
  return (await data(dataAccessListExports({ client, throwOnError: true }))).items
}

export async function createDataAccessOrganizationExport(
  kind: OrganizationDataExportKind,
): Promise<DataExportResponse> {
  return data(dataAccessCreateTenantExport({ body: { kind }, client, throwOnError: true }))
}

export async function createDataAccessCustomerExport(customerId: number): Promise<DataExportResponse> {
  return data(dataAccessCreateCustomerExport({
    path: { customer_id: customerId }, client, throwOnError: true,
  }))
}

export async function regenerateDataAccessExport(exportId: string): Promise<DataExportResponse> {
  return data(dataAccessRegenerateExport({
    path: { export_id: exportId }, client, throwOnError: true,
  }))
}

export async function cancelDataAccessExport(exportId: string): Promise<DataExportResponse> {
  return data(dataAccessCancelExport({
    path: { export_id: exportId }, client, throwOnError: true,
  }))
}

export async function downloadDataAccessExport(item: DataExportResponse): Promise<void> {
  const blob = await data(dataAccessDownloadExport({
    path: { export_id: item.export_id }, client, throwOnError: true,
  }))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = item.file_name || `data-export-${item.export_id}.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function readDataAccessPrivacyOverview(): Promise<PrivacyOverviewResponse> {
  return data(dataAccessReadPrivacyOverview({ client, throwOnError: true }))
}
