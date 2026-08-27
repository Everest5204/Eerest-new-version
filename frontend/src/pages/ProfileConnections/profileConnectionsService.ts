import api from "../../services/api";

import {
  followProfile,
  unfollowProfile,
} from "../../profileView/profileViewService";

import {
  subscribeToFollowEvents,
} from "../Follow/followService";

import type {
  ProfileConnectionActionResponse,
  ProfileConnectionListResponse,
  ProfileConnectionOwner,
  ProfileConnectionRealtimeEvent,
  ProfileConnectionTab,
  ProfileConnectionUser,
} from "./profileConnections.types";

const NO_CACHE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

const normalizeOwner = (
  value: Partial<ProfileConnectionOwner>,
): ProfileConnectionOwner => ({
  id: String(value.id ?? ""),
  first_name: String(value.first_name ?? ""),
  last_name: String(value.last_name ?? ""),
  profile_title: String(value.profile_title ?? ""),
  profile_image_url: String(
    value.profile_image_url ?? "",
  ),
  is_self: Boolean(value.is_self),
});

const normalizeUser = (
  value: Partial<ProfileConnectionUser>,
): ProfileConnectionUser => ({
  id: String(value.id ?? ""),
  first_name: String(value.first_name ?? ""),
  last_name: String(value.last_name ?? ""),
  profile_title: String(value.profile_title ?? ""),
  profile_image_url: String(
    value.profile_image_url ?? "",
  ),
  is_following: Boolean(value.is_following),
  follows_you: Boolean(value.follows_you),
  is_self: Boolean(value.is_self),
});

const normalizeListResponse = (
  value: Partial<ProfileConnectionListResponse>,
): ProfileConnectionListResponse => ({
  owner: normalizeOwner(value.owner ?? {}),

  items: Array.isArray(value.items)
    ? value.items
        .map(normalizeUser)
        .filter((item) => item.id)
    : [],

  next_cursor:
    typeof value.next_cursor === "string"
      ? value.next_cursor
      : "",

  has_more: Boolean(value.has_more),

  followers_count: Math.max(
    0,
    Number(value.followers_count) || 0,
  ),

  following_count: Math.max(
    0,
    Number(value.following_count) || 0,
  ),
});

const normalizeActionResponse = (
  value: Partial<ProfileConnectionActionResponse>,
): ProfileConnectionActionResponse => ({
  is_following: Boolean(value.is_following),

  followers_count: Math.max(
    0,
    Number(value.followers_count) || 0,
  ),
});

const getConnectionsPath = (
  ownerUserID: string,
  tab: ProfileConnectionTab,
): string => {
  const cleanOwnerUserID = ownerUserID.trim();

  if (!cleanOwnerUserID) {
    throw new Error(
      "A valid profile user ID is required",
    );
  }

  if (
    tab !== "followers" &&
    tab !== "following"
  ) {
    throw new Error(
      "A valid connection tab is required",
    );
  }

  return `/profile-connections/${encodeURIComponent(
    cleanOwnerUserID,
  )}/${tab}`;
};

export const getProfileConnections = async (
  ownerUserID: string,
  tab: ProfileConnectionTab,
  cursor = "",
  limit = 20,
  signal?: AbortSignal,
): Promise<ProfileConnectionListResponse> => {
  const response =
    await api.get<ProfileConnectionListResponse>(
      getConnectionsPath(ownerUserID, tab),
      {
        signal,
        headers: NO_CACHE_HEADERS,

        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          t: Date.now(),
        },
      },
    );

  const normalizedResponse =
    normalizeListResponse(response.data ?? {});

  if (!normalizedResponse.owner.id) {
    throw new Error(
      "Invalid profile connections response",
    );
  }

  return normalizedResponse;
};

export const followConnectionUser = async (
  userID: string,
  signal?: AbortSignal,
): Promise<ProfileConnectionActionResponse> => {
  const response = await followProfile(
    userID,
    signal,
  );

  return normalizeActionResponse(response);
};

export const unfollowConnectionUser = async (
  userID: string,
  signal?: AbortSignal,
): Promise<ProfileConnectionActionResponse> => {
  const response = await unfollowProfile(
    userID,
    signal,
  );

  return normalizeActionResponse(response);
};

export const subscribeToProfileConnectionEvents = (
  onEvent: (
    event: ProfileConnectionRealtimeEvent,
  ) => void,
): (() => void) => {
  return subscribeToFollowEvents((event) => {
    onEvent({
      type: event.type,
      actor_user_id: event.actor_user_id,
      target_user_id: event.target_user_id,
      is_following: event.is_following,
      occurred_at: event.occurred_at,
    });
  });
};