import { describe, expect, it } from 'vitest'

import type { PublicOrganizationExperienceResponse } from '../../api/generated'
import { toOrganizationExperience } from './experienceAdapter'

describe('toOrganizationExperience', () => {
  it('normalizes optional collections and section defaults explicitly', () => {
    const dto: PublicOrganizationExperienceResponse = {
      schema_version: 1,
      organization: { slug: 'first', name: 'First' },
      profile: { country: 'Portugal', currency_code: 'EUR' },
      capabilities: ['catalog'],
      experience: {
        theme: { key: 'base' },
        pages: {
          home: {
            sections: [{ id: 'hero', type: 'hero' }],
          },
        },
      },
    }

    const experience = toOrganizationExperience(dto)

    expect(experience.profile.display_name).toBeNull()
    expect(experience.experience.navigation).toEqual([])
    expect(experience.experience.theme.token_overrides).toEqual({})
    expect(experience.experience.pages.home.sections[0]).toEqual({
      id: 'hero',
      type: 'hero',
      enabled: true,
      feature_key: null,
      variant: null,
      override_key: null,
      props: {},
    })
  })
})
