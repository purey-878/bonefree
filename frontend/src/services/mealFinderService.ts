import { apiData, adminApiClient, publicApiClient } from '../api/clients';
import { mealFinderConfig, mealFinderRecommendations, mealFinderAdminSettings, mealFinderSaveSettings } from '../api/generated';
import type { RecommendationRequest } from '../api/generated';
export const mealFinderService = {
  config: (signal?: AbortSignal) => apiData(mealFinderConfig({client: publicApiClient, signal, cache: 'no-store', throwOnError: true})),
  recommend: (body: RecommendationRequest, signal?: AbortSignal) => apiData(mealFinderRecommendations({client: publicApiClient, body, signal, cache: 'no-store', throwOnError: true})),
  settings: (signal?: AbortSignal) => apiData(mealFinderAdminSettings({client: adminApiClient, signal, cache: 'no-store', throwOnError: true})),
  save: (enabled: boolean) => apiData(mealFinderSaveSettings({client: adminApiClient, body: {enabled}, throwOnError: true})),
};
export type { Configuration, FinderSettings, Text, Match, RecommendationResult, Answers } from '../api/generated';
