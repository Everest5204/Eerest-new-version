export type ProfileView = {
  id: string;
  first_name: string;
  last_name: string;
  profile_title?: string;

  followers_count: number;
  following_count: number;
  posts_count: number;

  profile_image_url?: string;
  cover_image_url?: string;

  is_self: boolean;
  is_following: boolean;
  can_message: boolean;
};

export type ProfileViewResponse = {
  profile: ProfileView;
};

export type FollowMutationResponse = {
  is_following: boolean;
  followers_count: number;
};

export type ProfileViewTab = "all" | "photos" | "videos";

export type ProfileViewErrorResponse = {
  error: string;
};