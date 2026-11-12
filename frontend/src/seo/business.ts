/** Public company/social settings verified against the restaurant API, 2026-11-11.
 * Build-time identity, not opening hours, live prices or reservation availability.
 */
export const BUSINESS = {
  name: 'Bonefree',
  url: 'https://bonefree.pt',
  description: 'A vegan restaurant and bar in Costa da Caparica, serving plant-based dishes and cocktails.',
  telephone: '+351968107702',
  phoneDisplay: '+351 968 107 702',
  email: 'carambolarubra@gmail.com',
  fullAddress: 'Bonefree, R. Eng. Henrique Mendia 28A, 2825-450 Costa da Caparica',
  address: { '@type': 'PostalAddress', streetAddress: 'R. Eng. Henrique Mendia 28A', addressLocality: 'Costa da Caparica', postalCode: '2825-450', addressCountry: 'PT' },
  sameAs: ['https://www.facebook.com/b0nefree/', 'https://www.instagram.com/b0nefree/'],
} as const;
