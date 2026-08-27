import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import ProfileConnectionRow from "./ProfileConnectionRow";

import {
  useProfileConnections,
} from "./useProfileConnections";

import type {
  ProfileConnectionTab,
} from "./profileConnections.types";

import "./ProfileConnectionsPage.css";

const countFormatter = new Intl.NumberFormat(
  "en",
  {
    notation: "compact",
    maximumFractionDigits: 1,
  },
);

const formatCount = (
  count: number,
): string => {
  return countFormatter.format(
    Math.max(0, count),
  );
};

const getConnectionsPath = (
  ownerUserID: string,
  tab: ProfileConnectionTab,
): string => {
  return `/profile-connections/${encodeURIComponent(
    ownerUserID,
  )}/${tab}`;
};

const getProfilePath = (
  userID: string,
  isSelf = false,
): string => {
  if (
    isSelf ||
    userID.toLowerCase() === "me"
  ) {
    return "/profile";
  }

  return `/profile/${encodeURIComponent(
    userID,
  )}`;
};

const ProfileConnectionsSkeleton = () => {
  return (
    <div
      className="profile-connections-skeleton"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map(
        (_, index) => (
          <div
            className="profile-connections-skeleton__row"
            key={index}
          >
            <span className="profile-connections-skeleton__avatar" />

            <span className="profile-connections-skeleton__details">
              <span className="profile-connections-skeleton__name" />
              <span className="profile-connections-skeleton__title" />
            </span>

            <span className="profile-connections-skeleton__button" />
          </div>
        ),
      )}
    </div>
  );
};

const ProfileConnectionsPage = () => {
  const navigate = useNavigate();

  const {
    userID: routeUserID = "",
    tab: routeTab = "",
  } = useParams<{
    userID: string;
    tab: string;
  }>();

  const ownerUserID = routeUserID.trim();

  const normalizedRouteTab =
    routeTab.trim().toLowerCase();

  const activeTab: ProfileConnectionTab =
    normalizedRouteTab === "following"
      ? "following"
      : "followers";

  const loadMoreTargetRef =
    useRef<HTMLDivElement | null>(null);

  const {
    owner,
    items,

    followersCount,
    followingCount,

    hasMore,
    isInitialLoading,
    isLoadingMore,

    error,

    loadMore,
    reload,

    toggleConnection,
    isActionPending,
    clearError,
  } = useProfileConnections(
    ownerUserID,
    activeTab,
  );

  const ownerFullName = [
    owner?.first_name,
    owner?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const pageTitle = owner
    ? owner.is_self
      ? "Your Connections"
      : `${ownerFullName || "Profile"}'s Connections`
    : "Connections";

  /*
   * Connections page history থেকে remove করে
   * আগের Profile page-এ ফিরে যাবে।
   *
   * এরপর Profile থেকে Back দিলে
   * Home Feed-এ ফিরে যাবে।
   */
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  /*
   * Followers এবং Following tab পরিবর্তনের সময়
   * নতুন browser history তৈরি হবে না।
   */
  const handleTabChange = useCallback(
    (nextTab: ProfileConnectionTab) => {
      if (
        !ownerUserID ||
        nextTab === activeTab
      ) {
        return;
      }

      navigate(
        getConnectionsPath(
          ownerUserID,
          nextTab,
        ),
        {
          replace: true,
        },
      );
    },
    [
      activeTab,
      navigate,
      ownerUserID,
    ],
  );

  const handleOpenProfile = useCallback(
    (userID: string) => {
      const selectedUser = items.find(
        (item) => item.id === userID,
      );

      navigate(
        getProfilePath(
          userID,
          Boolean(selectedUser?.is_self),
        ),
      );
    },
    [items, navigate],
  );

  /*
   * Invalid বা missing tab থাকলে
   * Followers tab-এ clean redirect হবে।
   */
  useEffect(() => {
    if (
      !ownerUserID ||
      normalizedRouteTab === "followers" ||
      normalizedRouteTab === "following"
    ) {
      return;
    }

    navigate(
      getConnectionsPath(
        ownerUserID,
        "followers",
      ),
      {
        replace: true,
      },
    );
  }, [
    navigate,
    normalizedRouteTab,
    ownerUserID,
  ]);

  useEffect(() => {
    const previousTitle = document.title;

    document.title = ownerFullName
      ? `${ownerFullName} · Connections`
      : "Profile Connections";

    return () => {
      document.title = previousTitle;
    };
  }, [ownerFullName]);

  /*
   * User নিচে scroll করলে automatically
   * পরবর্তী page load হবে।
   */
  useEffect(() => {
    const target =
      loadMoreTargetRef.current;

    if (
      !target ||
      !hasMore ||
      isInitialLoading ||
      isLoadingMore ||
      error ||
      typeof IntersectionObserver ===
        "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];

        if (firstEntry?.isIntersecting) {
          void loadMore();
        }
      },
      {
        root: null,
        rootMargin: "240px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    error,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    loadMore,
  ]);

  return (
    <main className="profile-connections-page">
      <section className="profile-connections-card">
        <header className="profile-connections-header">
          <div className="profile-connections-header__top">
            <button
              type="button"
              className="profile-connections-back-button"
              aria-label="Back to profile"
              onClick={handleBack}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M15 18L9 12L15 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="profile-connections-heading">
              <h1 className="profile-connections-heading__title">
                {pageTitle}
              </h1>

              {ownerFullName && (
                <p className="profile-connections-heading__subtitle">
                  {ownerFullName}
                </p>
              )}
            </div>

            <span
              className="profile-connections-header__spacer"
              aria-hidden="true"
            />
          </div>

          <div
            className="profile-connections-tabs"
            role="tablist"
            aria-label="Profile connections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "followers"
              }
              className={[
                "profile-connections-tab",
                activeTab === "followers"
                  ? "profile-connections-tab--active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                handleTabChange("followers")
              }
            >
              <span>Followers</span>

              <span className="profile-connections-tab__count">
                {formatCount(
                  followersCount,
                )}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "following"
              }
              className={[
                "profile-connections-tab",
                activeTab === "following"
                  ? "profile-connections-tab--active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                handleTabChange("following")
              }
            >
              <span>Following</span>

              <span className="profile-connections-tab__count">
                {formatCount(
                  followingCount,
                )}
              </span>
            </button>
          </div>
        </header>

        <div
          className="profile-connections-content"
          role="tabpanel"
          aria-label={
            activeTab === "followers"
              ? "Followers"
              : "Following"
          }
        >
          {isInitialLoading &&
            items.length === 0 && (
              <ProfileConnectionsSkeleton />
            )}

          {!isInitialLoading &&
            error &&
            items.length === 0 && (
              <div
                className="profile-connections-state"
                role="alert"
              >
                <span className="profile-connections-state__icon">
                  !
                </span>

                <h2 className="profile-connections-state__title">
                  Unable to load connections
                </h2>

                <p className="profile-connections-state__message">
                  {error}
                </p>

                <button
                  type="button"
                  className="profile-connections-state__button"
                  onClick={() => void reload()}
                >
                  Try again
                </button>
              </div>
            )}

          {error && items.length > 0 && (
            <div
              className="profile-connections-error-banner"
              role="alert"
            >
              <span className="profile-connections-error-banner__message">
                {error}
              </span>

              <div className="profile-connections-error-banner__actions">
                <button
                  type="button"
                  onClick={() => void reload()}
                >
                  Retry
                </button>

                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={clearError}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!isInitialLoading &&
            !error &&
            items.length === 0 && (
              <div className="profile-connections-state">
                <span
                  className="profile-connections-state__empty-icon"
                  aria-hidden="true"
                >
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M16 21V19C16 16.79 14.21 15 12 15H6C3.79 15 2 16.79 2 19V21"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />

                    <circle
                      cx="9"
                      cy="7"
                      r="4"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />

                    <path
                      d="M19 8V14M22 11H16"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>

                <h2 className="profile-connections-state__title">
                  {activeTab === "followers"
                    ? "No followers yet"
                    : "Not following anyone yet"}
                </h2>

                <p className="profile-connections-state__message">
                  {activeTab === "followers"
                    ? "New followers will appear here."
                    : "People followed by this profile will appear here."}
                </p>
              </div>
            )}

          {items.length > 0 && (
            <div className="profile-connections-list">
              {items.map((user) => (
                <ProfileConnectionRow
                  key={user.id}
                  user={user}
                  isActionPending={isActionPending(
                    user.id,
                  )}
                  onOpenProfile={
                    handleOpenProfile
                  }
                  onToggleConnection={
                    toggleConnection
                  }
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div
              ref={loadMoreTargetRef}
              className="profile-connections-load-more"
            >
              <button
                type="button"
                className="profile-connections-load-more__button"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
              >
                {isLoadingMore && (
                  <span
                    className="profile-connections-load-more__spinner"
                    aria-hidden="true"
                  />
                )}

                <span>
                  {isLoadingMore
                    ? "Loading"
                    : error
                      ? "Try loading more"
                      : "Load more"}
                </span>
              </button>
            </div>
          )}

          <div
            className="profile-connections-live-region"
            aria-live="polite"
            aria-atomic="true"
          >
            {isLoadingMore
              ? "Loading more connections"
              : ""}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ProfileConnectionsPage;