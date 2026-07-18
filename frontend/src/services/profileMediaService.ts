import api from "./api";

export type UpdatedUserResponse = {
  id?: string;
  first_name?: string;
  last_name?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  profile_image_url?: string;
  cover_image_url?: string;
};

const normalizeUserResponse = (data: unknown): UpdatedUserResponse => {
  const rawData = data as Record<string, any>;
  const user = rawData?.user ?? rawData ?? {};

  return {
    id: user.id ?? user._id ?? "",

    first_name: user.first_name ?? user.firstName ?? "",
    last_name: user.last_name ?? user.lastName ?? "",

    followers_count: Number(user.followers_count ?? user.followersCount ?? 0),
    following_count: Number(user.following_count ?? user.followingCount ?? 0),
    posts_count: Number(user.posts_count ?? user.postsCount ?? 0),

    profile_image_url:
      user.profile_image_url ??
      user.profileImageURL ??
      user.ProfileImageURL ??
      "",

    cover_image_url:
      user.cover_image_url ??
      user.coverImageURL ??
      user.CoverImageURL ??
      "",
  };
};

const uploadImage = async (
  endpoint: string,
  fieldName: string,
  file: File
): Promise<UpdatedUserResponse> => {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await api.post(endpoint, formData, {
    timeout: 45000,
  });

  return normalizeUserResponse(response.data);
};

export const uploadProfileImage = async (
  file: File
): Promise<UpdatedUserResponse> => {
  return uploadImage("/profile-media/profile-image", "profile_image", file);
};

export const uploadCoverImage = async (
  file: File
): Promise<UpdatedUserResponse> => {
  return uploadImage("/profile-media/cover-image", "cover_image", file);
};