import api from "../services/api";

import type {
  FollowMutationResponse,
  ProfileView,
  ProfileViewResponse,
} from "./profileView.types";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
} as const;

const getProfilePath = (userID: string): string => {
  const cleanUserID = userID.trim();

  if (!cleanUserID) {
    throw new Error("A valid user ID is required");
  }

  return `/users/${encodeURIComponent(cleanUserID)}`;
};

export const getProfileView = async (
  userID: string,
  signal?: AbortSignal,
): Promise<ProfileView> => {
  const response = await api.get<ProfileViewResponse>(
    `${getProfilePath(userID)}/profile`,
    {
      signal,
      headers: NO_CACHE_HEADERS,
      params: {
        t: Date.now(),
      },
    },
  );

  const profile = response.data?.profile;

  if (!profile?.id) {
    throw new Error("Invalid profile response");
  }

  return profile;
};

export const followProfile = async (
  userID: string,
  signal?: AbortSignal,
): Promise<FollowMutationResponse> => {
  const response = await api.put<FollowMutationResponse>(
    `${getProfilePath(userID)}/follow`,
    undefined,
    {
      signal,
      headers: NO_CACHE_HEADERS,
      params: {
        t: Date.now(),
      },
    },
  );

  return response.data;
};

export const unfollowProfile = async (
  userID: string,
  signal?: AbortSignal,
): Promise<FollowMutationResponse> => {
  const response = await api.delete<FollowMutationResponse>(
    `${getProfilePath(userID)}/follow`,
    {
      signal,
      headers: NO_CACHE_HEADERS,
      params: {
        t: Date.now(),
      },
    },
  );

  return response.data;
};