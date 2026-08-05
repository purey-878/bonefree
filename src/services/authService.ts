import { API_BASE, authHeaders } from "./api";
import { translateUserMessage } from "../utils/messages";
import type { User, RegisterRequest, ProfileUpdateRequest } from "../types/user";
import type { OrderResponse } from "../types/checkout";

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface VerifyOtpResponse {
  message: string;
  reset_token: string;
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const error = (await response.json()) as { detail?: string };
    return new Error(translateUserMessage(error.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw await parseError(response, "Login failed");
    }

    return response.json();
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseError(response, "Registration failed");
    }

    return response.json();
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE}/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw await parseError(response, "Unable to send reset code");
    }

    return response.json();
  },

  async verifyPasswordOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const response = await fetch(`${API_BASE}/password/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      throw await parseError(response, "Invalid reset code");
    }

    return response.json();
  },

  async resetPassword(email: string, resetToken: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE}/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        reset_token: resetToken,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      throw await parseError(response, "Unable to reset password");
    }

    return response.json();
  },

  async getCurrentUser(): Promise<User> {
    const response = await fetch(`${API_BASE}/me`, {
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar os dados do utilizador.");
    }

    return response.json();
  },

  async updateProfile(data: ProfileUpdateRequest): Promise<User> {
    const response = await fetch(`${API_BASE}/profile`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseError(response, "Failed to update profile");
    }

    return response.json();
  },

  async getPurchaseHistory(filters: Record<string, string>): Promise<OrderResponse[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const query = params.toString();
    const response = await fetch(`${API_BASE}/profile/orders${query ? `?${query}` : ""}`, {
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw await parseError(response, "Failed to fetch purchase history");
    }

    return response.json();
  },
};
