import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  User,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import Post from "../components/Post/Post";

import {
  getUserPosts,
  type FeedPost,
} from "../services/postService";

import {
  getUserTextPosts,
} from "../components/textpost/textPostService";

import { useProfileView } from "./useProfileView";

import type {
  ProfileViewTab,
} from "./profileView.types";

import "./ProfileViewPage.css";

const PROFILE_POST_LIMIT = 6;

type ApiErrorShape = {
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
    };
  };
};

const getErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  const apiError = error as ApiErrorShape;
  const responseMessage = apiError.response?.data?.error;

  if (
    typeof responseMessage === "string" &&
    responseMessage.trim()
  ) {
    return responseMessage;
  }

  if (
    typeof apiError.message === "string" &&
    apiError.message.trim()
  ) {
    return apiError.message;
  }

  return fallbackMessage;
};

const getPostCreatedTime = (post: FeedPost): number => {
  const createdTime = new Date(post.created_at).getTime();

  return Number.isFinite(createdTime) ? createdTime : 0;
};

const isTextPost = (post: FeedPost): boolean => {
  return (
    post.type === "text" ||
    Boolean(post.text) ||
    Boolean(post.text_background) ||
    Boolean(post.text_color) ||
    Boolean(post.text_style)
  );
};

const mergePostData = (
  existingPost: FeedPost,
  incomingPost: FeedPost,
): FeedPost => {
  if (isTextPost(incomingPost)) {
    return {
      ...existingPost,
      ...incomingPost,
      type:
        incomingPost.type ||
        existingPost.type ||
        "text",
      caption:
        incomingPost.caption ??
        existingPost.caption,
      text:
        incomingPost.text ??
        existingPost.text,
      text_background:
        incomingPost.text_background ??
        existingPost.text_background,
      text_color:
        incomingPost.text_color ??
        existingPost.text_color,
      text_style:
        incomingPost.text_style ??
        existingPost.text_style,
      media:
        incomingPost.media.length > 0
          ? incomingPost.media
          : existingPost.media,
      media_url:
        incomingPost.media_url ||
        existingPost.media_url,
      media_id:
        incomingPost.media_id ||
        existingPost.media_id,
      media_type:
        incomingPost.media_type ||
        existingPost.media_type,
    };
  }

  return {
    ...existingPost,
    ...incomingPost,
    media:
      incomingPost.media.length > 0
        ? incomingPost.media
        : existingPost.media,
  };
};

const mergeUniquePosts = (
  orderedPosts: FeedPost[],
): FeedPost[] => {
  const postMap = new Map<string, FeedPost>();

  orderedPosts.forEach((post) => {
    if (!post.id) {
      return;
    }

    const existingPost = postMap.get(post.id);

    postMap.set(
      post.id,
      existingPost
        ? mergePostData(existingPost, post)
        : post,
    );
  });

  return Array.from(postMap.values()).sort(
    (firstPost, secondPost) =>
      getPostCreatedTime(secondPost) -
      getPostCreatedTime(firstPost),
  );
};

const postHasMediaType = (
  post: FeedPost,
  mediaType: "image" | "video",
): boolean => {
  if (
    post.media.some(
      (mediaItem) => mediaItem.type === mediaType,
    )
  ) {
    return true;
  }

  return post.media_type === mediaType;
};

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");

  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";

  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      throw new Error("Copy command failed");
    }
  } finally {
    textArea.remove();
  }
};

const ProfileHeaderSkeleton = () => {
  return (
    <div
      className="profileViewHeaderSkeleton"
      aria-label="Loading profile"
    >
      <div className="profileViewSkeletonCover" />

      <div className="profileViewSkeletonContent">
        <div className="profileViewSkeletonAvatar" />
        <div className="profileViewSkeletonLine profileViewSkeletonName" />
        <div className="profileViewSkeletonLine profileViewSkeletonStats" />
        <div className="profileViewSkeletonActions">
          <div />
          <div />
          <div />
        </div>
      </div>
    </div>
  );
};

const ProfileFeedSkeleton = () => {
  return (
    <div
      className="profileViewFeedSkeleton"
      aria-label="Loading posts"
    >
      {Array.from({ length: 2 }).map((_, index) => (
        <article
          className="profileViewPostSkeleton"
          key={index}
        >
          <div className="profileViewPostSkeletonHeader">
            <div className="profileViewPostSkeletonAvatar" />

            <div>
              <div className="profileViewPostSkeletonLine" />
              <div className="profileViewPostSkeletonLine short" />
            </div>
          </div>

          <div className="profileViewPostSkeletonMedia" />
        </article>
      ))}
    </div>
  );
};

const ProfileViewPage = () => {
  const navigate = useNavigate();
  const { userID } = useParams<{ userID: string }>();

  const cleanUserID = userID?.trim() ?? "";

  const observerRef = useRef<HTMLDivElement | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadingRef = useRef(false);
  const feedSessionRef = useRef(0);

  const {
    profile,
    isLoading,
    isFollowPending,
    error,
    actionError,
    reload,
    toggleFollow,
  } = useProfileView(cleanUserID);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [mediaNextCursor, setMediaNextCursor] = useState("");
  const [textNextCursor, setTextNextCursor] = useState("");

  const [
    hasMoreMediaPosts,
    setHasMoreMediaPosts,
  ] = useState(false);

  const [
    hasMoreTextPosts,
    setHasMoreTextPosts,
  ] = useState(false);

  const [postsLoading, setPostsLoading] = useState(false);
  const [
    initialPostsLoaded,
    setInitialPostsLoaded,
  ] = useState(false);

  const [postsError, setPostsError] = useState<string | null>(
    null,
  );

  const [activeTab, setActiveTab] =
    useState<ProfileViewTab>("all");

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedRequestVersion, setFeedRequestVersion] =
    useState(0);

  const hasMorePosts =
    hasMoreMediaPosts || hasMoreTextPosts;

  const setPostsLoadingState = useCallback(
    (value: boolean) => {
      loadingRef.current = value;
      setPostsLoading(value);
    },
    [],
  );

  useEffect(() => {
    if (profile?.is_self) {
      navigate("/profile", {
        replace: true,
      });
    }
  }, [navigate, profile?.is_self]);

  useEffect(() => {
    if (!cleanUserID) {
      setPosts([]);
      setPostsError("Profile user ID is missing");
      setInitialPostsLoaded(true);
      setPostsLoadingState(false);
      return;
    }

    const sessionID = feedSessionRef.current + 1;
    feedSessionRef.current = sessionID;

    setPosts([]);
    setMediaNextCursor("");
    setTextNextCursor("");
    setHasMoreMediaPosts(false);
    setHasMoreTextPosts(false);
    setPostsError(null);
    setInitialPostsLoaded(false);
    setPostsLoadingState(true);

    const loadInitialPosts = async (): Promise<void> => {
      try {
        const [mediaResponse, textResponse] =
          await Promise.all([
            getUserPosts(
              cleanUserID,
              "",
              PROFILE_POST_LIMIT,
            ),
            getUserTextPosts(
              cleanUserID,
              "",
              PROFILE_POST_LIMIT,
            ),
          ]);

        if (feedSessionRef.current !== sessionID) {
          return;
        }

        setPosts(
          mergeUniquePosts([
            ...mediaResponse.posts,
            ...textResponse.posts,
          ]),
        );

        setMediaNextCursor(mediaResponse.next_cursor);
        setTextNextCursor(textResponse.next_cursor);

        setHasMoreMediaPosts(mediaResponse.has_more);
        setHasMoreTextPosts(textResponse.has_more);
      } catch (requestError: unknown) {
        if (feedSessionRef.current !== sessionID) {
          return;
        }

        setPostsError(
          getErrorMessage(
            requestError,
            "Unable to load profile posts",
          ),
        );
      } finally {
        if (feedSessionRef.current === sessionID) {
          setInitialPostsLoaded(true);
          setPostsLoadingState(false);
        }
      }
    };

    void loadInitialPosts();

    return () => {
      if (feedSessionRef.current === sessionID) {
        feedSessionRef.current += 1;
        loadingRef.current = false;
      }
    };
  }, [
    cleanUserID,
    feedRequestVersion,
    setPostsLoadingState,
  ]);

  const loadMorePosts = useCallback(async (): Promise<void> => {
    if (
      !cleanUserID ||
      !hasMorePosts ||
      loadingRef.current
    ) {
      return;
    }

    const shouldLoadMedia =
      hasMoreMediaPosts && Boolean(mediaNextCursor);

    const shouldLoadText =
      hasMoreTextPosts && Boolean(textNextCursor);

    if (!shouldLoadMedia && !shouldLoadText) {
      if (hasMoreMediaPosts) {
        setHasMoreMediaPosts(false);
      }

      if (hasMoreTextPosts) {
        setHasMoreTextPosts(false);
      }

      return;
    }

    const sessionID = feedSessionRef.current;

    setPostsLoadingState(true);
    setPostsError(null);

    try {
      const [mediaResponse, textResponse] =
        await Promise.all([
          shouldLoadMedia
            ? getUserPosts(
                cleanUserID,
                mediaNextCursor,
                PROFILE_POST_LIMIT,
              )
            : Promise.resolve(null),

          shouldLoadText
            ? getUserTextPosts(
                cleanUserID,
                textNextCursor,
                PROFILE_POST_LIMIT,
              )
            : Promise.resolve(null),
        ]);

      if (feedSessionRef.current !== sessionID) {
        return;
      }

      setPosts((currentPosts) =>
        mergeUniquePosts([
          ...currentPosts,
          ...(mediaResponse?.posts ?? []),
          ...(textResponse?.posts ?? []),
        ]),
      );

      if (mediaResponse) {
        setMediaNextCursor(mediaResponse.next_cursor);
        setHasMoreMediaPosts(mediaResponse.has_more);
      }

      if (textResponse) {
        setTextNextCursor(textResponse.next_cursor);
        setHasMoreTextPosts(textResponse.has_more);
      }
    } catch (requestError: unknown) {
      if (feedSessionRef.current !== sessionID) {
        return;
      }

      setPostsError(
        getErrorMessage(
          requestError,
          "Unable to load more posts",
        ),
      );
    } finally {
      if (feedSessionRef.current === sessionID) {
        setPostsLoadingState(false);
      }
    }
  }, [
    cleanUserID,
    hasMoreMediaPosts,
    hasMorePosts,
    hasMoreTextPosts,
    mediaNextCursor,
    setPostsLoadingState,
    textNextCursor,
  ]);

  useEffect(() => {
    const target = observerRef.current;

    if (!target || !hasMorePosts) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMorePosts();
        }
      },
      {
        root: null,
        rootMargin: "360px",
        threshold: 0.1,
      },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMorePosts, loadMorePosts]);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      copyButtonRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isMoreOpen]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutID = window.setTimeout(() => {
      setNotice(null);
    }, 2600);

    return () => window.clearTimeout(timeoutID);
  }, [notice]);

  const filteredPosts = useMemo(() => {
    if (activeTab === "photos") {
      return posts.filter((post) =>
        postHasMediaType(post, "image"),
      );
    }

    if (activeTab === "videos") {
      return posts.filter((post) =>
        postHasMediaType(post, "video"),
      );
    }

    return posts;
  }, [activeTab, posts]);

  const reloadFeed = useCallback(() => {
    setFeedRequestVersion(
      (currentVersion) => currentVersion + 1,
    );
  }, []);

  const handlePageRetry = useCallback(() => {
    reload();
    reloadFeed();
  }, [reload, reloadFeed]);

  const handleMessage = useCallback(() => {
    if (!profile?.can_message) {
      return;
    }

    setNotice(
      "Messaging will be connected in the Chat section.",
    );
  }, [profile?.can_message]);

  const copyProfileLink = useCallback(async () => {
    if (!profile) {
      return;
    }

    const profileURL =
      `${window.location.origin}/profile/` +
      encodeURIComponent(profile.id);

    try {
      await copyText(profileURL);
      setNotice("Profile link copied");
    } catch {
      setNotice("Unable to copy profile link");
    } finally {
      setIsMoreOpen(false);
    }
  }, [profile]);

  if (isLoading && !profile) {
    return (
      <main className="profileViewPage">
        <div className="profileViewWrapper">
          <ProfileHeaderSkeleton />
          <ProfileFeedSkeleton />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="profileViewPage">
        <section
          className="profileViewErrorState"
          role="alert"
        >
          <User size={68} strokeWidth={1.5} />
          <h1>Profile unavailable</h1>
          <p>{error ?? "Unable to find this profile."}</p>

          <button
            type="button"
            onClick={handlePageRetry}
          >
            <RefreshCw size={18} />
            Try Again
          </button>
        </section>
      </main>
    );
  }

  if (profile.is_self) {
    return null;
  }

  const fullName =
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "Everest User";

  const profileImageURL =
    profile.profile_image_url?.trim() ?? "";

  const coverImageURL =
    profile.cover_image_url?.trim() ?? "";

  const totalPosts = Math.max(
    Number(profile.posts_count) || 0,
    posts.length,
  );

  const emptyStateTitle =
    activeTab === "photos"
      ? "No photos yet"
      : activeTab === "videos"
        ? "No videos yet"
        : "No posts yet";

  return (
    <>
      <main className="profileViewPage">
        <div className="profileViewWrapper">
          <section className="profileViewHeader">
            <div className="profileViewCover">
              {coverImageURL ? (
                <img
                  src={coverImageURL}
                  alt={`${fullName}'s cover`}
                  className="profileViewCoverImage"
                  loading="eager"
                  decoding="async"
                />
              ) : null}
            </div>

            <div className="profileViewInfo">
              <div className="profileViewAvatar">
                {profileImageURL ? (
                  <img
                    src={profileImageURL}
                    alt={fullName}
                    className="profileViewAvatarImage"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <User size={104} strokeWidth={1.7} />
                )}
              </div>

              <h1 className="profileViewName">
                {fullName}
              </h1>

              {profile.profile_title ? (
                <p className="profileViewTitle">
                  {profile.profile_title}
                </p>
              ) : null}

             <div
  className="profileViewStats"
  aria-label="Profile statistics"
>
  <Link
    to={`/profile-connections/${encodeURIComponent(
      profile.id,
    )}/followers`}
    aria-label={`View ${profile.followers_count} followers`}
    style={{
      color: "inherit",
      textDecoration: "none",
    }}
  >
    <strong>
      {profile.followers_count}
    </strong>{" "}
    followers
  </Link>

  <span aria-hidden="true">•</span>

  <Link
    to={`/profile-connections/${encodeURIComponent(
      profile.id,
    )}/following`}
    aria-label={`View ${profile.following_count} following`}
    style={{
      color: "inherit",
      textDecoration: "none",
    }}
  >
    <strong>
      {profile.following_count}
    </strong>{" "}
    following
  </Link>

  <span aria-hidden="true">•</span>

  <span>
    <strong>{totalPosts}</strong>{" "}
    {totalPosts === 1 ? "post" : "posts"}
  </span>
</div>

              <div className="profileViewActions">
                <button
                  type="button"
                  className={`profileViewFollowButton ${
                    profile.is_following
                      ? "isFollowing"
                      : ""
                  }`}
                  aria-pressed={profile.is_following}
                  disabled={isFollowPending}
                  onClick={() => {
                    void toggleFollow();
                  }}
                >
                  {isFollowPending ? (
                    <Loader2
                      className="profileViewSpinner"
                      size={20}
                    />
                  ) : profile.is_following ? (
                    <UserCheck size={20} />
                  ) : (
                    <UserPlus size={20} />
                  )}

                  {isFollowPending
                    ? "Please wait"
                    : profile.is_following
                      ? "Following"
                      : "Follow"}
                </button>

                <button
                  type="button"
                  className="profileViewMessageButton"
                  disabled={!profile.can_message}
                  onClick={handleMessage}
                >
                  <MessageCircle size={20} />
                  Message
                </button>

                <button
                  type="button"
                  className="profileViewMoreButton"
                  aria-label="More profile options"
                  aria-expanded={isMoreOpen}
                  aria-controls="profile-view-options"
                  onClick={() => setIsMoreOpen(true)}
                >
                  <MoreHorizontal size={24} />
                </button>
              </div>

              {actionError ? (
                <p
                  className="profileViewActionError"
                  role="alert"
                >
                  {actionError}
                </p>
              ) : null}

              <div
                className="profileViewTabs"
                role="tablist"
                aria-label="Profile posts"
              >
                {(
                  [
                    ["all", "All"],
                    ["photos", "Photos"],
                    ["videos", "Videos"],
                  ] as const
                ).map(([tabValue, tabLabel]) => (
                  <button
                    key={tabValue}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tabValue}
                    className={
                      activeTab === tabValue
                        ? "active"
                        : ""
                    }
                    onClick={() => setActiveTab(tabValue)}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section
            className="profileViewPosts"
            aria-label={`${fullName}'s posts`}
          >
            {filteredPosts.map((post) => (
              <Post key={post.id} post={post} />
            ))}

            {postsLoading && posts.length === 0 ? (
              <ProfileFeedSkeleton />
            ) : null}

            {postsError ? (
              <div
                className="profileViewPostsError"
                role="alert"
              >
                <p>{postsError}</p>

                <button
                  type="button"
                  onClick={reloadFeed}
                >
                  <RefreshCw size={17} />
                  Retry
                </button>
              </div>
            ) : null}

            <div
              ref={observerRef}
              className="profileViewFeedObserver"
              aria-hidden="true"
            />

            {postsLoading && posts.length > 0 ? (
              <div
                className="profileViewLoadingMore"
                aria-label="Loading more posts"
              >
                <Loader2
                  className="profileViewSpinner"
                  size={24}
                />
              </div>
            ) : null}

            {initialPostsLoaded &&
            !postsLoading &&
            !postsError &&
            filteredPosts.length === 0 &&
            !hasMorePosts ? (
              <div className="profileViewEmptyState">
                <FileText size={62} strokeWidth={1.5} />
                <h2>{emptyStateTitle}</h2>
                <p>
                  This user has not shared anything here.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {isMoreOpen ? (
        <div
          className="profileViewSheetBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsMoreOpen(false);
            }
          }}
        >
          <section
            id="profile-view-options"
            className="profileViewBottomSheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-view-options-title"
          >
            <div
              className="profileViewSheetHandle"
              aria-hidden="true"
            />

            <header className="profileViewSheetHeader">
              <h2 id="profile-view-options-title">
                Profile options
              </h2>

              <button
                type="button"
                aria-label="Close profile options"
                onClick={() => setIsMoreOpen(false)}
              >
                <X size={21} />
              </button>
            </header>

            <button
              ref={copyButtonRef}
              type="button"
              className="profileViewCopyLinkButton"
              onClick={() => {
                void copyProfileLink();
              }}
            >
              <span className="profileViewSheetIcon">
                <Copy size={21} />
              </span>

              <span>
                <strong>Copy profile link</strong>
                <small>
                  Copy a direct link to this profile
                </small>
              </span>
            </button>
          </section>
        </div>
      ) : null}

      {notice ? (
        <div
          className="profileViewNotice"
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      ) : null}
    </>
  );
};

export default memo(ProfileViewPage);