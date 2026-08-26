import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  followProfile,
  getProfileView,
  unfollowProfile,
} from "./profileViewService";

import type { ProfileView } from "./profileView.types";

type ApiErrorShape = {
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
    };
  };
};

export type UseProfileViewResult = {
  profile: ProfileView | null;
  isLoading: boolean;
  isFollowPending: boolean;
  error: string | null;
  actionError: string | null;
  reload: () => void;
  toggleFollow: () => Promise<void>;
};

const getErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  const apiError = error as ApiErrorShape;
  const responseMessage = apiError.response?.data?.error;

  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }

  if (typeof apiError.message === "string" && apiError.message.trim()) {
    return apiError.message;
  }

  return fallbackMessage;
};

export const useProfileView = (
  rawUserID?: string,
): UseProfileViewResult => {
  const userID = rawUserID?.trim() ?? "";

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const followPendingRef = useRef(false);
  const followRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!userID) {
      setProfile(null);
      setError("Profile user ID is missing");
      setIsLoading(false);

      return () => controller.abort();
    }

    setProfile(null);
    setError(null);
    setIsLoading(true);

    void getProfileView(userID, controller.signal)
      .then((freshProfile) => {
        if (!controller.signal.aborted) {
          setProfile(freshProfile);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            getErrorMessage(
              requestError,
              "Unable to load this profile",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [requestVersion, userID]);

  useEffect(() => {
    const activeRequest = followRequestRef.current;

    followRequestRef.current = null;
    followPendingRef.current = false;

    activeRequest?.abort();

    setIsFollowPending(false);
    setActionError(null);
  }, [userID]);

  useEffect(() => {
    return () => {
      followRequestRef.current?.abort();
    };
  }, []);

  const reload = useCallback(() => {
    setRequestVersion((currentVersion) => currentVersion + 1);
  }, []);

  const toggleFollow = useCallback(async (): Promise<void> => {
    if (
      !profile ||
      profile.is_self ||
      followPendingRef.current
    ) {
      return;
    }

    const targetUserID = profile.id;
    const shouldUnfollow = profile.is_following;
    const controller = new AbortController();

    followPendingRef.current = true;
    followRequestRef.current = controller;

    setIsFollowPending(true);
    setActionError(null);

    try {
      const result = shouldUnfollow
        ? await unfollowProfile(targetUserID, controller.signal)
        : await followProfile(targetUserID, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      setProfile((currentProfile) => {
        if (!currentProfile || currentProfile.id !== targetUserID) {
          return currentProfile;
        }

        return {
          ...currentProfile,
          is_following: result.is_following,
          followers_count: Math.max(
            0,
            Number(result.followers_count) || 0,
          ),
        };
      });
    } catch (requestError: unknown) {
      if (!controller.signal.aborted) {
        setActionError(
          getErrorMessage(
            requestError,
            shouldUnfollow
              ? "Unable to unfollow this user"
              : "Unable to follow this user",
          ),
        );
      }
    } finally {
      if (followRequestRef.current === controller) {
        followRequestRef.current = null;
        followPendingRef.current = false;
        setIsFollowPending(false);
      }
    }
  }, [profile]);

  return {
    profile,
    isLoading,
    isFollowPending,
    error,
    actionError,
    reload,
    toggleFollow,
  };
};