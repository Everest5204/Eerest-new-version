/** Accept only same-site copied post/profile destinations, never an external redirect. */
const SHARED_DESTINATION = /^\/(post|profile)\/[a-f\d]{24}$/i;

export const sharedLinkDestination = (value: unknown): string | null =>
  typeof value === "string" && SHARED_DESTINATION.test(value) ? value : null;

export const sharedLinkReturn = (location: { search: string; state: unknown }): string | null => {
  const query = sharedLinkDestination(new URLSearchParams(location.search).get("next"));
  if (query) return query;
  const state = location.state;
  return state && typeof state === "object" && "from" in state
    ? sharedLinkDestination(state.from)
    : null;
};

export const sharedLinkAuthURL = (page: "/signup" | "/login", destination: string | null): string => {
  const safe = sharedLinkDestination(destination);
  return safe ? `${page}?${new URLSearchParams({ next: safe })}` : page;
};
