import axios from "axios";

import api from "../../services/api";

export const MAX_PROFILE_BIO_LENGTH =
  100;

export const PROFILE_UPDATED_EVENT =
  "everest:profile-updated";

const PROFILE_EDIT_ENDPOINT =
  "/profile/edit";

const NO_CACHE_HEADERS = {
  "Cache-Control":
    "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
} as const;

export type EditableProfile = {
  id: string;

  first_name: string;
  last_name: string;
  bio: string;

  profile_image_url: string;
  cover_image_url: string;
};

export type ProfileUpdatedDetail = {
  id: string;

  first_name?: string;
  last_name?: string;
  bio?: string;

  profile_image_url?: string;
  cover_image_url?: string;
};

type ProfileEditAPIResponse = {
  profile?: unknown;
  error?: string;
};

const asRecord = (
  value: unknown,
): Record<string, unknown> => {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
};

const readString = (
  value: unknown,
): string => {
  return typeof value === "string"
    ? value
    : "";
};

const normalizeEditableProfile = (
  data: unknown,
): EditableProfile => {
  const response = asRecord(
    data,
  );

  const profile = asRecord(
    response["profile"] ?? data,
  );

  const normalizedProfile: EditableProfile =
    {
      id: readString(
        profile["id"] ??
          profile["_id"],
      ).trim(),

      first_name: readString(
        profile["first_name"] ??
          profile["firstName"],
      ).trim(),

      last_name: readString(
        profile["last_name"] ??
          profile["lastName"],
      ).trim(),

      bio: readString(
        profile["bio"],
      ),

      profile_image_url:
        readString(
          profile[
            "profile_image_url"
          ] ??
            profile[
              "profileImageURL"
            ] ??
            profile[
              "ProfileImageURL"
            ],
        ).trim(),

      cover_image_url:
        readString(
          profile[
            "cover_image_url"
          ] ??
            profile[
              "coverImageURL"
            ] ??
            profile[
              "CoverImageURL"
            ],
        ).trim(),
    };

  if (!normalizedProfile.id) {
    throw new Error(
      "Invalid profile response",
    );
  }

  return normalizedProfile;
};

export const normalizeProfileBio = (
  value: string,
): string => {
  return value
    .replace(/\r\n?/g, "\n")
    .trim();
};

export const countProfileBioCharacters =
  (
    value: string,
  ): number => {
    return Array.from(
      value,
    ).length;
  };

const validateProfileBio = (
  value: string,
): string => {
  const bio =
    normalizeProfileBio(
      value,
    );

  if (
    countProfileBioCharacters(
      bio,
    ) > MAX_PROFILE_BIO_LENGTH
  ) {
    throw new Error(
      `Bio cannot contain more than ${MAX_PROFILE_BIO_LENGTH} characters`,
    );
  }

  return bio;
};

export const publishProfileUpdate = (
  detail: ProfileUpdatedDetail,
): void => {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const userID =
    detail.id.trim();

  if (!userID) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ProfileUpdatedDetail>(
      PROFILE_UPDATED_EVENT,
      {
        detail: {
          ...detail,
          id: userID,
        },
      },
    ),
  );
};

export const getEditableProfile =
  async (
    signal?: AbortSignal,
  ): Promise<EditableProfile> => {
    const response =
      await api.get<ProfileEditAPIResponse>(
        PROFILE_EDIT_ENDPOINT,
        {
          signal,

          headers:
            NO_CACHE_HEADERS,

          params: {
            t: Date.now(),
          },
        },
      );

    return normalizeEditableProfile(
      response.data,
    );
  };

export const updateProfileBio =
  async (
    bio: string,
    signal?: AbortSignal,
  ): Promise<EditableProfile> => {
    const cleanBio =
      validateProfileBio(
        bio,
      );

    const response =
      await api.patch<ProfileEditAPIResponse>(
        PROFILE_EDIT_ENDPOINT,
        {
          bio: cleanBio,
        },
        {
          signal,

          headers:
            NO_CACHE_HEADERS,

          params: {
            t: Date.now(),
          },
        },
      );

    const profile =
      normalizeEditableProfile(
        response.data,
      );

    publishProfileUpdate({
      id: profile.id,
      bio: profile.bio,
    });

    return profile;
  };

export const isProfileEditCancelled =
  (
    error: unknown,
  ): boolean => {
    return (
      axios.isCancel(error) ||
      (
        error as {
          name?: string;
        }
      )?.name ===
        "CanceledError" ||
      (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      )
    );
  };

export const getProfileEditErrorMessage =
  (
    error: unknown,
  ): string => {
    if (
      axios.isAxiosError(
        error,
      )
    ) {
      const responseData =
        asRecord(
          error.response?.data,
        );

      const apiMessage =
        readString(
          responseData["error"],
        ).trim();

      if (apiMessage) {
        return apiMessage;
      }

      switch (
        error.response?.status
      ) {
        case 400:
          return "Invalid profile information";

        case 401:
          return "Please log in again";

        case 404:
          return "Profile not found";

        case 413:
          return "Profile request is too large";

        default:
          return "Unable to update profile";
      }
    }

    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message.trim();
    }

    return "Unable to update profile";
  };