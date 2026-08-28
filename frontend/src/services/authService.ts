import {
  authForgotPassword,
  authGetMe,
  authLogin,
  authRegister,
  authResetPassword,
  authVerifyPasswordOtp,
  profileGetPurchaseHistory,
  profileGetOverview,
  profileUpdateProfile,
} from '../api/generated';
import type {
  ProfileGetPurchaseHistoryData,
  TokenResponse,
  UserProfileUpdate,
} from '../api/generated';
import { apiData, customerApiClient, publicApiClient } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type { OrderResponse } from '../types/checkout';
import type { Page } from '../types/pagination';
import type { ProfileUpdateRequest, RegisterRequest, User } from '../types/user';

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: User;
}

export interface VerifyOtpResponse { message: string; resetToken: string; }

export interface ProfileOverview {
  orderCount: number;
  totalSpent: number;
  totalItems: number;
  averageOrderValue: number;
  favoriteProducts: Array<{ productId: number; productDisplayId: string; name: string; quantity: number; total: number }>;
  latestOrder: OrderResponse | null;
  loyaltyProgress: { current: number; required: number; remaining: number; percent: number; minimumSubtotal: number };
}

function mapAuthResponse(dto: TokenResponse): AuthResponse {
  return toDomain<AuthResponse>(dto);
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const dto = await apiData(authLogin({
      body: { email, password },
      client: publicApiClient,
      throwOnError: true,
    }));
    return mapAuthResponse(dto);
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const dto = await apiData(authRegister({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
        last_name: data.lastName,
        phone: data.phone,
        tax_id: data.taxId,
      },
      client: publicApiClient,
      throwOnError: true,
    }));
    return mapAuthResponse(dto);
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return apiData(authForgotPassword({
      body: { email },
      client: publicApiClient,
      throwOnError: true,
    }));
  },

  async verifyPasswordOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const dto = await apiData(authVerifyPasswordOtp({
      body: { email, code },
      client: publicApiClient,
      throwOnError: true,
    }));
    return toDomain<VerifyOtpResponse>(dto);
  },

  async resetPassword(email: string, resetToken: string, newPassword: string): Promise<{ message: string }> {
    return apiData(authResetPassword({
      body: { email, reset_token: resetToken, new_password: newPassword },
      client: publicApiClient,
      throwOnError: true,
    }));
  },

  async getCurrentUser(): Promise<User> {
    return toDomain<User>(await apiData(authGetMe({
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async updateProfile(data: ProfileUpdateRequest): Promise<User> {
    const body = toDto<UserProfileUpdate>(data);
    return toDomain<User>(await apiData(profileUpdateProfile({
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getPurchaseHistory(filters: Record<string, string | number>): Promise<Page<OrderResponse>> {
    const populatedFilters = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => typeof value === 'number' || value.trim().length > 0),
    );
    const query = toDto<NonNullable<ProfileGetPurchaseHistoryData['query']>>(populatedFilters);
    return toDomain<Page<OrderResponse>>(await apiData(profileGetPurchaseHistory({
      query,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getProfileOverview(): Promise<ProfileOverview> {
    return toDomain<ProfileOverview>(await apiData(profileGetOverview({
      client: customerApiClient,
      throwOnError: true,
    })));
  },
};
