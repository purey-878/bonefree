import type {
  ExperienceAssets as ExperienceAssetsDto,
  OpeningHours as OpeningHoursDto,
  PublicOrganizationExperienceResponse,
  ThemeTokenOverrides as ThemeTokenOverridesDto,
  VariantOverrides as VariantOverridesDto,
} from '../../api/generated'
import type {
  ExperienceAssets,
  OpeningHours,
  OrganizationExperience,
  ThemeTokenOverrides,
  VariantOverrides,
} from '../model/types'

function toOpeningHours(value: OpeningHoursDto | undefined): OpeningHours {
  const result: OpeningHours = {}
  if (value?.monday) result.monday = value.monday
  if (value?.tuesday) result.tuesday = value.tuesday
  if (value?.wednesday) result.wednesday = value.wednesday
  if (value?.thursday) result.thursday = value.thursday
  if (value?.friday) result.friday = value.friday
  if (value?.saturday) result.saturday = value.saturday
  if (value?.sunday) result.sunday = value.sunday
  return result
}

function toThemeTokenOverrides(
  value: ThemeTokenOverridesDto | undefined,
): ThemeTokenOverrides {
  const result: ThemeTokenOverrides = {}
  if (value?.primary != null) result.primary = value.primary
  if (value?.accent != null) result.accent = value.accent
  if (value?.secondary != null) result.secondary = value.secondary
  if (value?.background != null) result.background = value.background
  if (value?.surface != null) result.surface = value.surface
  if (value?.text != null) result.text = value.text
  if (value?.text_muted != null) result.text_muted = value.text_muted
  if (value?.border != null) result.border = value.border
  if (value?.price_highlight != null) result.price_highlight = value.price_highlight
  return result
}

function toExperienceAssets(value: ExperienceAssetsDto | undefined): ExperienceAssets {
  return value?.logo == null ? {} : { logo: value.logo }
}

function toVariantOverrides(value: VariantOverridesDto | undefined): VariantOverrides {
  const result: VariantOverrides = {}
  if (value?.hero != null) result.hero = value.hero
  if (value?.category_navigation != null) result.category_navigation = value.category_navigation
  if (value?.loyalty != null) result.loyalty = value.loyalty
  if (value?.popular_products != null) result.popular_products = value.popular_products
  if (value?.chef_special != null) result.chef_special = value.chef_special
  if (value?.reviews != null) result.reviews = value.reviews
  if (value?.events != null) result.events = value.events
  return result
}

export function toOrganizationExperience(
  dto: PublicOrganizationExperienceResponse,
): OrganizationExperience {
  return {
    schema_version: dto.schema_version,
    organization: {
      slug: dto.organization.slug,
      name: dto.organization.name,
    },
    profile: {
      display_name: dto.profile.display_name ?? null,
      description: dto.profile.description ?? null,
      about_text: dto.profile.about_text ?? null,
      email: dto.profile.email ?? null,
      phone: dto.profile.phone ?? null,
      address_line_1: dto.profile.address_line_1 ?? null,
      address_line_2: dto.profile.address_line_2 ?? null,
      city: dto.profile.city ?? null,
      postal_code: dto.profile.postal_code ?? null,
      country: dto.profile.country,
      logo_url: dto.profile.logo_url ?? null,
      currency_code: dto.profile.currency_code,
      opening_hours: toOpeningHours(dto.profile.opening_hours),
      social_links: {
        links: (dto.profile.social_links?.links ?? []).map((link) => ({
          platform: link.platform,
          label: link.label,
          href: link.href,
          enabled: link.enabled ?? true,
        })),
      },
    },
    capabilities: [...dto.capabilities],
    experience: {
      theme: {
        key: dto.experience.theme.key,
        mode: dto.experience.theme.mode ?? null,
        decoration_preset: dto.experience.theme.decoration_preset ?? null,
        token_overrides: toThemeTokenOverrides(dto.experience.theme.token_overrides),
      },
      assets: toExperienceAssets(dto.experience.assets),
      navigation: (dto.experience.navigation ?? []).map((item) => ({
        id: item.id,
        route_id: item.route_id,
        label: item.label,
        enabled: item.enabled ?? true,
      })),
      pages: dto.experience.pages?.home
        ? {
          home: {
            sections: (dto.experience.pages.home.sections ?? []).map((section) => ({
              id: section.id,
              type: section.type,
              enabled: section.enabled ?? true,
              feature_key: section.feature_key ?? null,
              variant: section.variant ?? null,
              override_key: section.override_key ?? null,
              props: section.props ?? {},
            })),
          },
        }
        : {},
      variant_overrides: toVariantOverrides(dto.experience.variant_overrides),
    },
  }
}
