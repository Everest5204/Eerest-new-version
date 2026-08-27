export type ProfileConnectionTab =
  | "followers"
  | "following";

export type ProfileConnectionOwner = {
  id: string;
  first_name: string;
  last_name: string;
  profile_title?: string;
  profile_image_url?: string;
  is_self: boolean;
};

export type ProfileConnectionUser = {
  id: string;
  first_name: string;
  last_name: string;
  profile_title?: string;
  profile_image_url?: string;

  is_following: boolean;
  follows_you: boolean;
  is_self: boolean;
};

export type ProfileConnectionListResponse = {
  owner: ProfileConnectionOwner;
  items: ProfileConnectionUser[];

  next_cursor?: string;
  has_more: boolean;

  followers_count: number;
  following_count: number;
};

export type ProfileConnectionActionResponse = {
  is_following: boolean;
  followers_count: number;
};

export type ProfileConnectionRealtimeEvent = {
  type: "follow.changed";
  actor_user_id: string;
  target_user_id: string;
  is_following: boolean;
  occurred_at: string;
};

export type ProfileConnectionErrorResponse = {
  error: string;
};