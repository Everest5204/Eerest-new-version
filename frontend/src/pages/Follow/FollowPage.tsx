import {
  memo,
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  ArrowLeft,
  LoaderCircle,
  RefreshCw,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import BottomNav from
  "../../components/BottomNav/BottomNav";

import FollowUserRow from "./FollowUserRow";
import useFollowLists from "./useFollowLists";

import type {
  FollowTab,
} from "./follow.types";

import "./FollowPage.css";

const getActiveTab = (
  value: string | null,
): FollowTab => {
  return value === "following"
    ? "following"
    : "followers";
};

const FollowListSkeleton = () => {
  return (
    <div
      className="followSkeletonList"
      aria-label="Loading connections"
    >
      {Array.from({ length: 7 }).map(
        (_, index) => (
          <div
            className="followSkeletonRow"
            key={index}
          >
            <div className="followSkeletonAvatar" />

            <div className="followSkeletonText">
              <span />
              <span />
            </div>

            <div className="followSkeletonButton" />
          </div>
        ),
      )}
    </div>
  );
};

const FollowPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] =
    useSearchParams();

  const activeTab = getActiveTab(
    searchParams.get("tab"),
  );

  const loadMoreRef =
    useRef<HTMLDivElement | null>(null);

  const {
    items,
    followersCount,
    followingCount,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    pendingUserIDs,
    loadMore,
    refresh,
    toggleFollow,
  } = useFollowLists(activeTab);

  const selectTab = useCallback(
    (tab: FollowTab) => {
      setSearchParams(
        {
          tab,
        },
        {
          replace: true,
        },
      );
    },
    [setSearchParams],
  );

  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (
      !target ||
      !hasMore ||
      isLoading ||
      isLoadingMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [
    hasMore,
    isLoading,
    isLoadingMore,
    loadMore,
  ]);

  const emptyTitle =
    activeTab === "followers"
      ? "No followers yet"
      : "Not following anyone yet";

  const emptyMessage =
    activeTab === "followers"
      ? "New followers will appear here instantly."
      : "People you follow will appear here.";

  return (
    <>
      <main className="followPage">
        <section className="followPanel">
          <header className="followHeader">
            <button
              type="button"
              className="followBackButton"
              aria-label="Go back"
              onClick={goBack}
            >
              <ArrowLeft size={24} />
            </button>

            <div>
              <h1>Connections</h1>
              <p>Followers and following</p>
            </div>

            <button
              type="button"
              className="followRefreshButton"
              aria-label="Refresh follow data"
              disabled={isLoading}
              onClick={refresh}
            >
              <RefreshCw
                size={21}
                className={
                  isLoading ? "isSpinning" : ""
                }
              />
            </button>
          </header>

          <div
            className="followTabs"
            role="tablist"
            aria-label="Connections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "followers"
              }
              className={
                activeTab === "followers"
                  ? "active"
                  : ""
              }
              onClick={() =>
                selectTab("followers")
              }
            >
              <UsersRound size={19} />
              <span>Followers</span>
              <strong>{followersCount}</strong>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={
                activeTab === "following"
              }
              className={
                activeTab === "following"
                  ? "active"
                  : ""
              }
              onClick={() =>
                selectTab("following")
              }
            >
              <UserRoundCheck size={19} />
              <span>Following</span>
              <strong>{followingCount}</strong>
            </button>
          </div>

          <div
            className="followContent"
            aria-live="polite"
          >
            {error ? (
              <div
                className="followErrorState"
                role="alert"
              >
                <p>{error}</p>

                <button
                  type="button"
                  onClick={refresh}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {isLoading && items.length === 0 ? (
              <FollowListSkeleton />
            ) : null}

            {!isLoading &&
            !error &&
            items.length === 0 ? (
              <div className="followEmptyState">
                {activeTab === "followers" ? (
                  <UsersRound size={58} />
                ) : (
                  <UserRoundCheck size={58} />
                )}

                <h2>{emptyTitle}</h2>
                <p>{emptyMessage}</p>
              </div>
            ) : null}

            {items.length > 0 ? (
              <div className="followUserList">
                {items.map((user) => (
                  <FollowUserRow
                    key={user.id}
                    user={user}
                    isPending={pendingUserIDs.has(
                      user.id,
                    )}
                    onToggleFollow={(selectedUser) => {
                      void toggleFollow(
                        selectedUser,
                      );
                    }}
                  />
                ))}
              </div>
            ) : null}

            <div
              ref={loadMoreRef}
              className="followLoadMoreTrigger"
              aria-hidden="true"
            />

            {isLoadingMore ? (
              <div className="followLoadingMore">
                <LoaderCircle
                  className="followActionSpinner"
                  size={21}
                />
                <span>Loading more</span>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <BottomNav />
    </>
  );
};

export default memo(FollowPage);
