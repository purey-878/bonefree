import type { CompanyDetailsSettings, SocialMediaSettings, SocialPlatform } from "../types/siteSettings"

export const defaultCompanyDetails: CompanyDetailsSettings = {
  brandName: "BONEFREE",
  description:
    "A BONEFREE é um restaurante e bar vegan na Costa da Caparica. Servimos pratos 100% vegetais, cocktails artesanais e um ambiente descontraído.",
  address: "Bonefree, R. Eng. Henrique Mendia 28A, 2825-450 Costa da Caparica",
  phone: "+351 968 107 703",
  email: "carambolarubra@gmail.com",
}

export const socialIconPaths: Record<SocialPlatform, string> = {
  facebook: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z",
  instagram:
    "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm5 7.25A2.75 2.75 0 1 0 12 14.75 2.75 2.75 0 0 0 12 9.25Zm6.25-2.5h.01",
  whatsapp:
    "M3 20.5 4.25 16A8.25 8.25 0 1 1 8 19.75L3 20.5Zm6.2-11.1c.2 2.55 2.25 4.6 5.4 5.4l1.25-1.25a.9.9 0 0 1 .92-.22c1 .32 1.78.5 2.38.55.35.03.62.32.62.67v1.8c0 .38-.3.7-.68.7C13.12 17.05 7 10.92 7 4.95c0-.38.32-.68.7-.68h1.8c.35 0 .64.27.67.62.05.6.23 1.38.55 2.38a.9.9 0 0 1-.22.92L9.2 9.4Z",
  youtube:
    "M22 8.2a3 3 0 0 0-2.1-2.12C18.05 5.6 12 5.6 12 5.6s-6.05 0-7.9.48A3 3 0 0 0 2 8.2 31.35 31.35 0 0 0 1.5 12 31.35 31.35 0 0 0 2 15.8a3 3 0 0 0 2.1 2.12c1.85.48 7.9.48 7.9.48s6.05 0 7.9-.48A3 3 0 0 0 22 15.8a31.35 31.35 0 0 0 .5-3.8A31.35 31.35 0 0 0 22 8.2ZM10 15.1V8.9l5.2 3.1L10 15.1Z",
}

export const defaultSocialMediaSettings: SocialMediaSettings = {
  links: [
    { platform: "facebook", label: "Facebook", href: "#", enabled: true },
    { platform: "instagram", label: "Instagram", href: "#", enabled: true },
    { platform: "whatsapp", label: "WhatsApp", href: "#", enabled: true },
    { platform: "youtube", label: "YouTube", href: "#", enabled: true },
  ],
}
