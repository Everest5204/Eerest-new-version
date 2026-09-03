const DEFAULT_API_BASE_URL = "http://localhost:5000";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email_or_phone: string;
  email_verified?: boolean;
  gender?: string;
  birth_month?: number;
  birth_day?: number;
  birth_year?: number;
  profile_image_url?: string;
  cover_image_url?: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
  updated_at?: string;
}

export interface SignupRequest {
  first_name: string;
  last_name: string;
  email_or_phone: string;
  password: string;
  gender: string;
  birth_month: number;
  birth_day: number;
  birth_year: number;
}

export interface LoginRequest {
  email_or_phone: string;
  password: string;
}

export interface GoogleAuthRequest {
  credential: string;
}

export interface GoogleSignupRequest {
  credential: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_month: number;
  birth_day: number;
  birth_year: number;
}

export interface AuthResponse {
  token: string;
  user?: User;
  message?: string;
}

export interface GoogleProfile {
  email: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
}

export interface GoogleAuthResponse {
  needs_signup: boolean;
  token?: string;
  user?: User;
  profile?: GoogleProfile;
  message?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorMessage = (
  data: unknown,
  fallback: string
): string => {
  if (!isRecord(data)) {
    return fallback;
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  return fallback;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `Request failed with status ${response.status}`)
    );
  }

  return data as T;
};

const request = async <T>(
  path: string,
  options: RequestInit
): Promise<T> => {
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  return parseResponse<T>(response);
};

export const signupUser = (
  userData: SignupRequest
): Promise<AuthResponse> =>
  request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(userData),
  });

export const loginUser = (
  userData: LoginRequest
): Promise<AuthResponse> =>
  request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(userData),
  });

export const googleAuthUser = (
  googleData: GoogleAuthRequest
): Promise<GoogleAuthResponse> =>
  request<GoogleAuthResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify(googleData),
  });

export const googleSignupUser = (
  googleData: GoogleSignupRequest
): Promise<AuthResponse> =>
  request<AuthResponse>("/api/auth/google/signup", {
    method: "POST",
    body: JSON.stringify(googleData),
  });

export const getCurrentUser = (): Promise<User> => {
  const token = sessionStorage.getItem("token");

  if (!token) {
    return Promise.reject(new Error("Unauthorized"));
  }

  return request<User>("/api/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};