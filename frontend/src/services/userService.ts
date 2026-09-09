import api from "./api";

export type CurrentUserResponse = {
  id?: string;
  first_name: string;
  last_name: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  bio: string;
  profile_image_url?: string;
  cover_image_url?: string;
};

export const getCurrentUser =
  async (): Promise<CurrentUserResponse> => {
    const response =
      await api.get("/user/me");

    const user =
      response.data?.user ??
      response.data ??
      {};

    console.log(
      "USER API RESPONSE:",
      user,
    );

    return {
      id:
        user.id ??
        user._id ??
        "",

      first_name:
        user.first_name ??
        user.firstName ??
        "",

      last_name:
        user.last_name ??
        user.lastName ??
        "",

      followers_count:
        user.followers_count ??
        user.followersCount ??
        0,

      following_count:
        user.following_count ??
        user.followingCount ??
        0,

      posts_count:
        user.posts_count ??
        user.postsCount ??
        0,

      bio:
        user.bio ??
        "",

      profile_image_url:
        user.profile_image_url ??
        user.profileImageURL ??
        "",

      cover_image_url:
        user.cover_image_url ??
        user.coverImageURL ??
        "",
    };
  };