import { API_BASE, adminHeaders } from "./api";
import { translateUserMessage } from "../utils/messages";
import type {
  ChefSpecialSettings,
  CompanyDetailsSettings,
  EventsSettings,
  LoyaltyCouponSettings,
  SiteThemeResponse,
  SiteThemeSettings,
  SocialMediaSettings,
} from "../types/siteSettings";

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    return new Error(translateUserMessage(data.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

export async function getPublicSiteTheme(): Promise<SiteThemeResponse> {
  const response = await fetch(`${API_BASE}/site-settings/theme`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar o tema do site.");
  return response.json();
}

export async function getPublicChefSpecial(): Promise<ChefSpecialSettings> {
  const response = await fetch(`${API_BASE}/site-settings/chef-special`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar o produto em destaque.");
  return response.json();
}

export async function getPublicLoyaltyCouponSettings(): Promise<LoyaltyCouponSettings> {
  const response = await fetch(`${API_BASE}/site-settings/loyalty-coupons`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de cupões.");
  return response.json();
}

export async function getPublicCompanyDetails(): Promise<CompanyDetailsSettings> {
  const response = await fetch(`${API_BASE}/site-settings/company-details`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar os detalhes da empresa.");
  return response.json();
}

export async function getPublicSocialMediaSettings(): Promise<SocialMediaSettings> {
  const response = await fetch(`${API_BASE}/site-settings/social-media`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de redes sociais.");
  return response.json();
}

export async function getPublicEventsSettings(): Promise<EventsSettings> {
  const response = await fetch(`${API_BASE}/site-settings/events`);
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de eventos.");
  return response.json();
}

export async function getAdminSiteTheme(): Promise<SiteThemeResponse> {
  const response = await fetch(`${API_BASE}/admin/site-settings/theme`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar o tema do site.");
  return response.json();
}

export async function getAdminChefSpecial(): Promise<ChefSpecialSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/chef-special`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar o produto em destaque.");
  return response.json();
}

export async function getAdminLoyaltyCouponSettings(): Promise<LoyaltyCouponSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/loyalty-coupons`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de cupões.");
  return response.json();
}

export async function getAdminCompanyDetails(): Promise<CompanyDetailsSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/company-details`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar os detalhes da empresa.");
  return response.json();
}

export async function getAdminSocialMediaSettings(): Promise<SocialMediaSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/social-media`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de redes sociais.");
  return response.json();
}

export async function getAdminEventsSettings(): Promise<EventsSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/events`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível carregar as definições de eventos.");
  return response.json();
}

export async function updateAdminSiteTheme(payload: SiteThemeSettings): Promise<SiteThemeResponse> {
  const response = await fetch(`${API_BASE}/admin/site-settings/theme`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar o tema do site.");
  return response.json();
}

export async function updateAdminChefSpecial(payload: ChefSpecialSettings): Promise<ChefSpecialSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/chef-special`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar o produto em destaque.");
  return response.json();
}

export async function updateAdminLoyaltyCouponSettings(payload: LoyaltyCouponSettings): Promise<LoyaltyCouponSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/loyalty-coupons`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar as definições de cupões.");
  return response.json();
}

export async function updateAdminCompanyDetails(payload: CompanyDetailsSettings): Promise<CompanyDetailsSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/company-details`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar os detalhes da empresa.");
  return response.json();
}

export async function updateAdminSocialMediaSettings(payload: SocialMediaSettings): Promise<SocialMediaSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/social-media`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar as definições de redes sociais.");
  return response.json();
}

export async function updateAdminEventsSettings(payload: EventsSettings): Promise<EventsSettings> {
  const response = await fetch(`${API_BASE}/admin/site-settings/events`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Não foi possível guardar as definições de eventos.");
  return response.json();
}
