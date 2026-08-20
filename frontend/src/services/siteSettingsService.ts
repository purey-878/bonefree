import {
  siteSettingsReadAdminChefSpecial,
  siteSettingsReadAdminCompanyDetails,
  siteSettingsReadAdminEvents,
  siteSettingsReadAdminLoyaltyCouponSettings,
  siteSettingsReadAdminSiteTheme,
  siteSettingsReadAdminSocialMedia,
  siteSettingsReadPublicChefSpecial,
  siteSettingsReadPublicCompanyDetails,
  siteSettingsReadPublicEvents,
  siteSettingsReadPublicLoyaltyCouponSettings,
  siteSettingsReadPublicSiteTheme,
  siteSettingsReadPublicSocialMedia,
  siteSettingsUpdateAdminChefSpecial,
  siteSettingsUpdateAdminCompanyDetails,
  siteSettingsUpdateAdminEvents,
  siteSettingsUpdateAdminLoyaltyCouponSettings,
  siteSettingsUpdateAdminSiteTheme,
  siteSettingsUpdateAdminSocialMedia,
} from '../api/generated';
import type {
  ChefSpecialSettings as ChefSpecialDto,
  CompanyDetailsSettings as CompanyDetailsDto,
  EventsSettings as EventsDto,
  LoyaltyCouponSettingsInput as LoyaltyCouponDto,
  SiteThemeSettings as SiteThemeDto,
  SocialMediaSettings as SocialMediaDto,
} from '../api/generated';
import { adminApiClient, apiData, publicApiClient } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type {
  ChefSpecialSettings,
  CompanyDetailsSettings,
  EventsSettings,
  LoyaltyCouponSettings,
  SiteThemeResponse,
  SiteThemeSettings,
  SocialMediaSettings,
} from '../types/siteSettings';

export async function getPublicSiteTheme(): Promise<SiteThemeResponse> {
  return toDomain(await apiData(siteSettingsReadPublicSiteTheme({ client: publicApiClient, throwOnError: true })));
}
export async function getPublicChefSpecial(): Promise<ChefSpecialSettings> {
  return toDomain(await apiData(siteSettingsReadPublicChefSpecial({ client: publicApiClient, throwOnError: true })));
}
export async function getPublicLoyaltyCouponSettings(): Promise<LoyaltyCouponSettings> {
  return toDomain(await apiData(siteSettingsReadPublicLoyaltyCouponSettings({ client: publicApiClient, throwOnError: true })));
}
export async function getPublicCompanyDetails(): Promise<CompanyDetailsSettings> {
  return toDomain(await apiData(siteSettingsReadPublicCompanyDetails({ client: publicApiClient, throwOnError: true })));
}
export async function getPublicSocialMediaSettings(): Promise<SocialMediaSettings> {
  return toDomain(await apiData(siteSettingsReadPublicSocialMedia({ client: publicApiClient, throwOnError: true })));
}
export async function getPublicEventsSettings(): Promise<EventsSettings> {
  return toDomain(await apiData(siteSettingsReadPublicEvents({ client: publicApiClient, throwOnError: true })));
}

export async function getAdminSiteTheme(): Promise<SiteThemeResponse> {
  return toDomain(await apiData(siteSettingsReadAdminSiteTheme({ client: adminApiClient, throwOnError: true })));
}
export async function getAdminChefSpecial(): Promise<ChefSpecialSettings> {
  return toDomain(await apiData(siteSettingsReadAdminChefSpecial({ client: adminApiClient, throwOnError: true })));
}
export async function getAdminLoyaltyCouponSettings(): Promise<LoyaltyCouponSettings> {
  return toDomain(await apiData(siteSettingsReadAdminLoyaltyCouponSettings({ client: adminApiClient, throwOnError: true })));
}
export async function getAdminCompanyDetails(): Promise<CompanyDetailsSettings> {
  return toDomain(await apiData(siteSettingsReadAdminCompanyDetails({ client: adminApiClient, throwOnError: true })));
}
export async function getAdminSocialMediaSettings(): Promise<SocialMediaSettings> {
  return toDomain(await apiData(siteSettingsReadAdminSocialMedia({ client: adminApiClient, throwOnError: true })));
}
export async function getAdminEventsSettings(): Promise<EventsSettings> {
  return toDomain(await apiData(siteSettingsReadAdminEvents({ client: adminApiClient, throwOnError: true })));
}

export async function updateAdminSiteTheme(payload: SiteThemeSettings): Promise<SiteThemeResponse> {
  return toDomain(await apiData(siteSettingsUpdateAdminSiteTheme({
    body: toDto<SiteThemeDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateAdminChefSpecial(payload: ChefSpecialSettings): Promise<ChefSpecialSettings> {
  return toDomain(await apiData(siteSettingsUpdateAdminChefSpecial({
    body: toDto<ChefSpecialDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateAdminLoyaltyCouponSettings(payload: LoyaltyCouponSettings): Promise<LoyaltyCouponSettings> {
  return toDomain(await apiData(siteSettingsUpdateAdminLoyaltyCouponSettings({
    body: toDto<LoyaltyCouponDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateAdminCompanyDetails(payload: CompanyDetailsSettings): Promise<CompanyDetailsSettings> {
  return toDomain(await apiData(siteSettingsUpdateAdminCompanyDetails({
    body: toDto<CompanyDetailsDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateAdminSocialMediaSettings(payload: SocialMediaSettings): Promise<SocialMediaSettings> {
  return toDomain(await apiData(siteSettingsUpdateAdminSocialMedia({
    body: toDto<SocialMediaDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateAdminEventsSettings(payload: EventsSettings): Promise<EventsSettings> {
  return toDomain(await apiData(siteSettingsUpdateAdminEvents({
    body: toDto<EventsDto>(payload), client: adminApiClient, throwOnError: true,
  })));
}
