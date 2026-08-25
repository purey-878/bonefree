import type { PublicOrganizationExperienceResponse } from '../../api/generated'
import type { OrganizationExperience } from '../model/types'

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
      opening_hours: dto.profile.opening_hours ?? {},
      social_links: dto.profile.social_links ?? {},
    },
    capabilities: [...dto.capabilities],
    experience: {
      theme: {
        key: dto.experience.theme.key,
        mode: dto.experience.theme.mode ?? null,
        decoration_preset: dto.experience.theme.decoration_preset ?? null,
        token_overrides: dto.experience.theme.token_overrides ?? {},
      },
      assets: dto.experience.assets ?? {},
      navigation: (dto.experience.navigation ?? []).map((item) => ({
        id: item.id,
        route_id: item.route_id,
        label: item.label,
        enabled: item.enabled ?? true,
      })),
      pages: Object.fromEntries(
        Object.entries(dto.experience.pages ?? {}).map(([pageKey, page]) => [
          pageKey,
          {
            sections: (page.sections ?? []).map((section) => ({
              id: section.id,
              type: section.type,
              enabled: section.enabled ?? true,
              feature_key: section.feature_key ?? null,
              variant: section.variant ?? null,
              override_key: section.override_key ?? null,
              props: section.props ?? {},
            })),
          },
        ]),
      ),
      variant_overrides: dto.experience.variant_overrides ?? {},
    },
  }
}
