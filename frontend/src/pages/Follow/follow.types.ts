export type FollowTab =
  | "followers"
  | "following";

export type FollowUser = {
  id: string;
  first_name: string;
  last_name: string;
  profile_title?: string;
  profile_image_url?: string;
  is_following: boolean;
  follows_you: boolean;
  is_self: boolean;
};

export type FollowListResponse = {
  items: FollowUser[];
  next_cursor?: string;
  has_more: boolean;
  followers_count: number;
  following_count: number;
};

export type FollowActionResponse = {
  is_following: boolean;
  followers_count: number;
};

export type FollowRealtimeEvent = {
  type: "follow.changed";
  actor_user_id: string;
  target_user_id: string;
  is_following: boolean;
  occurred_at: string;
};
