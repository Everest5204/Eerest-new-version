import api from "./api";

export type ReactionType = "love" | "haha" | "wow" | "sad" | "angry";

export type ReactionCounts = Partial<Record<ReactionType, number>>;

export type ReactionUser = {
  id: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
};

export type PostReactionSummary = {
  total: number;
  counts: ReactionCounts;
  top_reactions: ReactionType[];
  current_user_reaction: ReactionType | "";
  first_reactor?: ReactionUser | null;
};

export type SetReactionResponse = {
  reaction_type: ReactionType | "";
  summary: PostReactionSummary;
};

export type ReactionUserItem = {
  id: string;
  reaction_type: ReactionType;
  user: ReactionUser;
};

export type ReactionUsersResponse = {
  items: ReactionUserItem[];
  counts: ReactionCounts;
  total: number;
};

export const REACTION_META: Record<
  ReactionType,
  {
    label: string;
    emoji: string;
  }
> = {
  love: { label: "Love", emoji: "❤️" },
  haha: { label: "Haha", emoji: "😆" },
  wow: { label: "Wow", emoji: "😮" },
  sad: { label: "Sad", emoji: "😢" },
  angry: { label: "Angry", emoji: "😡" },
};

const REACTION_TYPES: ReactionType[] = ["love", "haha", "wow", "sad", "angry"];

/*
  Summary-te Facebook-er moto maximum 2 ta emoji show korbe.
  Example: ❤️ 😮 Murad Ahmed +1
*/
const SUMMARY_ICON_LIMIT = 2;

const normalizeReactionType = (value: unknown): ReactionType | "" => {
  if (REACTION_TYPES.includes(value as ReactionType)) {
    return value as ReactionType;
  }

  return "";
};

const normalizeCounts = (counts: unknown): ReactionCounts => {
  if (!counts || typeof counts !== "object") return {};

  const rawCounts = counts as Record<string, unknown>;

  return REACTION_TYPES.reduce<ReactionCounts>((result, type) => {
    const value = Number(rawCounts[type] ?? 0);

    if (Number.isFinite(value) && value > 0) {
      result[type] = value;
    }

    return result;
  }, {});
};

const buildTopReactions = (counts: ReactionCounts): ReactionType[] => {
  return REACTION_TYPES.filter((type) => Number(counts[type] ?? 0) > 0)
    .sort((a, b) => Number(counts[b] ?? 0) - Number(counts[a] ?? 0))
    .slice(0, SUMMARY_ICON_LIMIT);
};

const getCountsTotal = (counts: ReactionCounts): number => {
  return Object.values(counts).reduce(
    (sum, value) => sum + Number(value ?? 0),
    0
  );
};

const normalizeReactionUser = (user: unknown): ReactionUser | null => {
  if (!user || typeof user !== "object") return null;

  const rawUser = user as any;

  const id = String(rawUser?.id ?? rawUser?._id ?? rawUser?.user_id ?? "");

  if (!id) return null;

  return {
    id,
    first_name: String(rawUser?.first_name ?? ""),
    last_name: String(rawUser?.last_name ?? ""),
    profile_image_url: String(rawUser?.profile_image_url ?? ""),
  };
};

export const normalizeReactionSummary = (
  data: unknown
): PostReactionSummary => {
  const rawData = data as any;
  const rawSummary = rawData?.summary ?? rawData ?? {};

  const counts = normalizeCounts(rawSummary?.counts);
  const totalFromCounts = getCountsTotal(counts);

  const rawTotal = Number(rawSummary?.total ?? rawSummary?.total_count);
  const total = Number.isFinite(rawTotal) ? rawTotal : totalFromCounts;

  const topReactions = Array.isArray(rawSummary?.top_reactions)
    ? rawSummary.top_reactions
        .map(normalizeReactionType)
        .filter(Boolean)
        .slice(0, SUMMARY_ICON_LIMIT)
    : buildTopReactions(counts);

  return {
    total,
    counts,
    top_reactions: topReactions as ReactionType[],
    current_user_reaction: normalizeReactionType(
      rawSummary?.current_user_reaction ??
        rawSummary?.my_reaction ??
        rawData?.reaction_type
    ),
    first_reactor: normalizeReactionUser(rawSummary?.first_reactor),
  };
};

const normalizeReactionUserItem = (item: unknown): ReactionUserItem | null => {
  if (!item || typeof item !== "object") return null;

  const rawItem = item as any;

  const reactionType = normalizeReactionType(
    rawItem?.reaction_type ?? rawItem?.type
  );

  if (!reactionType) return null;

  const user =
    normalizeReactionUser(rawItem?.user) ??
    normalizeReactionUser({
      id: rawItem?.user_id,
      _id: rawItem?.user_id,
      first_name: rawItem?.first_name,
      last_name: rawItem?.last_name,
      profile_image_url: rawItem?.profile_image_url,
    });

  if (!user) return null;

  return {
    id: String(rawItem?.id ?? rawItem?._id ?? `${user.id}-${reactionType}`),
    reaction_type: reactionType,
    user,
  };
};

const buildCountsFromItems = (items: ReactionUserItem[]): ReactionCounts => {
  return items.reduce<ReactionCounts>((result, item) => {
    result[item.reaction_type] = Number(result[item.reaction_type] ?? 0) + 1;
    return result;
  }, {});
};

const normalizeReactionUsersResponse = (
  data: unknown
): ReactionUsersResponse => {
  const rawData = data as any;

  const rawItems = Array.isArray(rawData?.items)
    ? rawData.items
    : Array.isArray(rawData?.users)
      ? rawData.users
      : Array.isArray(rawData?.reactions)
        ? rawData.reactions
        : Array.isArray(rawData)
          ? rawData
          : [];

  const items = rawItems
    .map(normalizeReactionUserItem)
    .filter(Boolean) as ReactionUserItem[];

  const rawCounts = normalizeCounts(rawData?.counts);
  const counts =
    Object.keys(rawCounts).length > 0 ? rawCounts : buildCountsFromItems(items);

  const totalFromCounts = getCountsTotal(counts);
  const totalFromItems = items.length;

  const rawTotal = Number(rawData?.total ?? rawData?.total_count);
  const total = Number.isFinite(rawTotal)
    ? rawTotal
    : Math.max(totalFromCounts, totalFromItems);

  return {
    items,
    counts,
    total,
  };
};

export const getPostReactionSummary = async (
  postId: string
): Promise<PostReactionSummary> => {
  if (!postId) {
    throw new Error("Post id is required");
  }

  const response = await api.get("/reactions/post", {
    params: {
      post_id: postId,
      t: Date.now(),
    },
  });

  return normalizeReactionSummary(response.data);
};

export const getPostReactionUsers = async (
  postId: string,
  reactionType: ReactionType | "all" = "all"
): Promise<ReactionUsersResponse> => {
  if (!postId) {
    throw new Error("Post id is required");
  }

  const response = await api.get("/reactions/users", {
    params: {
      post_id: postId,
      type: reactionType,
      t: Date.now(),
    },
  });

  return normalizeReactionUsersResponse(response.data);
};

export const setPostReaction = async (
  postId: string,
  reactionType: ReactionType
): Promise<SetReactionResponse> => {
  if (!postId) {
    throw new Error("Post id is required");
  }

  const response = await api.post(
    "/reactions",
    {
      post_id: postId,
      reaction_type: reactionType,
    },
    {
      params: {
        t: Date.now(),
      },
    }
  );

  const summary = normalizeReactionSummary(response.data);

  const currentReaction =
    normalizeReactionType(response.data?.reaction_type) ||
    summary.current_user_reaction ||
    reactionType;

  return {
    reaction_type: currentReaction,
    summary: {
      ...summary,
      current_user_reaction: currentReaction,
      top_reactions: summary.top_reactions.slice(0, SUMMARY_ICON_LIMIT),
    },
  };
};

export const removePostReaction = async (
  postId: string
): Promise<SetReactionResponse> => {
  if (!postId) {
    throw new Error("Post id is required");
  }

  const response = await api.delete("/reactions", {
    params: {
      post_id: postId,
      t: Date.now(),
    },
  });

  const summary = normalizeReactionSummary(response.data);

  return {
    reaction_type: "",
    summary: {
      ...summary,
      current_user_reaction: "",
      top_reactions: summary.top_reactions.slice(0, SUMMARY_ICON_LIMIT),
    },
  };
};