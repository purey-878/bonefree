import { legalDocumentsListAdmin, legalDocumentsPublish, legalDocumentsReadPublic } from '../api/generated'
import type { LegalDocumentResponse, LegalDocumentWrite } from '../api/generated'
import { adminApiClient, publicApiClient, apiData } from '../api/clients'

export type DocumentType = LegalDocumentResponse['document_type']
export type DocumentLocale = LegalDocumentResponse['locale']

export const listLegalDocuments = () => apiData(legalDocumentsListAdmin({ client: adminApiClient, throwOnError: true }))
export const publishLegalDocument = (document_type: DocumentType, locale: DocumentLocale, body: LegalDocumentWrite) =>
  apiData(legalDocumentsPublish({ client: adminApiClient, path: { document_type, locale }, body, throwOnError: true }))
export const readLegalDocument = (document_type: DocumentType, locale: DocumentLocale, signal?: AbortSignal) =>
  apiData(legalDocumentsReadPublic({ client: publicApiClient, path: { document_type }, query: { locale }, signal, throwOnError: true }))

export type { LegalDocumentWrite, LegalNodeInput, PublicLegalDocumentResponse } from '../api/generated'
