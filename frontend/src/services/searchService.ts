import api from "./api";

export type SearchUser = {
  id: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
  profile_title?: string;
};

export type SearchUsersResponse = {
  users: SearchUser[];
  count: number;
  query: string;
};

type RawSearchUser = Partial<SearchUser> & {
  _id?: string;
  firstName?: string;
  lastName?: string;
  profileImageURL?: string;
  profileTitle?: string;
};

type RawSearchUsersResponse = {
  users?: RawSearchUser[];
  count?: number;
  query?: string;
};

export const searchUsers = async (
  query: string,
  signal?: AbortSignal,
): Promise<SearchUsersResponse> => {
  const normalizedQuery = query.trim();

  const response = await api.get<RawSearchUsersResponse>(
    "/search/users",
    {
      params: {
        q: normalizedQuery,
        limit: 20,
      },
      signal,
    },
  );

  const rawUsers = Array.isArray(response.data?.users)
    ? response.data.users
    : [];

  const users: SearchUser[] = rawUsers
    .map((user) => ({
      id: user.id ?? user._id ?? "",
      first_name:
        user.first_name ??
        user.firstName ??
        "",
      last_name:
        user.last_name ??
        user.lastName ??
        "",
      profile_image_url:
        user.profile_image_url ??
        user.profileImageURL ??
        "",
      profile_title:
        user.profile_title ??
        user.profileTitle ??
        "",
    }))
    .filter((user) => user.id.length > 0);

  const responseCount = Number(response.data?.count);

  return {
    users,
    count: Number.isFinite(responseCount)
      ? responseCount
      : users.length,
    query:
      response.data?.query ??
      normalizedQuery,
  };
};