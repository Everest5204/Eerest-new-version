import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  Camera,
  CirclePlus,
  Copy,
  FileText,
  Images,
  LoaderCircle,
  MoreHorizontal,
  User,
  Video,
  X,
} from "lucide-react";

import Post from "../../components/Post/Post";

import PostActionToast from "../../features/post-actions/shared/PostActionToast";

import {
  VerifiedName,
} from "../../components/VerifiedBadge";

import {
  hasProfilePhotos,
  ProfilePhotoGallery,
  ProfilePhotoGallerySkeleton,
} from "../../features/profile-photo-gallery";

import {
  ProfileVideoGallery,
  ProfileVideoGallerySkeleton,
} from "../../features/profile-video-gallery";

import {
  getCurrentUser,
} from "../../services/userService";

import {
  uploadCoverImage,
  uploadProfileImage,
} from "../../services/profileMediaService";

import {
  getProfilePosts,
  type FeedPost,
} from "../../services/postService";

import {
  getMyTextPosts,
} from "../../components/textpost/textPostService";

import { useBackDismiss } from "../../hooks/useBackDismiss";

import "./Profile.css";
import "../../profileView/ProfileViewPage.css";

type UserProfile = {
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

type ProfileTab =
  | "all"
  | "photos"
  | "videos";

const PROFILE_INPUT_ID =
  "profile-image-input";

const COVER_INPUT_ID =
  "cover-image-input";

const PROFILE_POST_LIMIT = 6;

const getPostCreatedTime = (
  post: FeedPost,
): number => {
  const time = new Date(
    post.created_at,
  ).getTime();

  return Number.isFinite(time)
    ? time
    : 0;
};

const isTextPost = (
  post: FeedPost,
): boolean => {
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
        incomingPost.media &&
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
      incomingPost.media &&
      incomingPost.media.length > 0
        ? incomingPost.media
        : existingPost.media,
  };
};

const mergeUniquePosts = (
  orderedPosts: FeedPost[],
): FeedPost[] => {
  const map =
    new Map<string, FeedPost>();

  orderedPosts.forEach((post) => {
    if (!post.id) {
      return;
    }

    const existingPost =
      map.get(post.id);

    if (!existingPost) {
      map.set(post.id, post);
      return;
    }

    map.set(
      post.id,
      mergePostData(
        existingPost,
        post,
      ),
    );
  });

  return Array.from(
    map.values(),
  ).sort(
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
      (mediaItem) =>
        mediaItem.type === mediaType,
    )
  ) {
    return true;
  }

  return post.media_type === mediaType;
};

const ProfileFeedSkeleton = () => {
  return (
    <div className="profileFeedSkeleton">
      {Array.from({
        length: 3,
      }).map((_, index) => (
        <article
          className="profilePostSkeleton"
          key={index}
        >
          <div className="profileSkeletonHeader">
            <div className="profileSkeletonAvatar" />

            <div className="profileSkeletonText">
              <div className="profileSkeletonLine short" />

              <div className="profileSkeletonLine tiny" />
            </div>
          </div>

          <div className="profileSkeletonMedia" />

          <div className="profileSkeletonActions" />
        </article>
      ))}
    </div>
  );
};

const Profile = () => {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const observerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const loadingRef =
    useRef(false);

  const initialLoadStartedRef =
    useRef(false);

  const [user, setUser] =
    useState<UserProfile | null>(
      null,
    );

  const [posts, setPosts] =
    useState<FeedPost[]>([]);

  const [
    mediaNextCursor,
    setMediaNextCursor,
  ] = useState("");

  const [
    textNextCursor,
    setTextNextCursor,
  ] = useState("");

  const [
    hasMoreMediaPosts,
    setHasMoreMediaPosts,
  ] = useState(false);

  const [
    hasMoreTextPosts,
    setHasMoreTextPosts,
  ] = useState(false);

  const [
    postsLoading,
    setPostsLoading,
  ] = useState(false);

  const [
    initialPostsLoaded,
    setInitialPostsLoaded,
  ] = useState(false);

  const [
    profileUploading,
    setProfileUploading,
  ] = useState(false);

  const [
    coverUploading,
    setCoverUploading,
  ] = useState(false);

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<ProfileTab>(
      "all",
    );

  const [
    profileSheetOpen,
    setProfileSheetOpen,
  ] = useState(false);

  const [
    storyNoticeOpen,
    setStoryNoticeOpen,
  ] = useState(false);

  const hasMorePosts =
    hasMoreMediaPosts ||
    hasMoreTextPosts;

  const hasMoreActivePosts =
    activeTab === "all"
      ? hasMorePosts
      : hasMoreMediaPosts;

  const openEditProfile =
    useCallback(() => {
      const returnTo =
        `${location.pathname}${location.search}${location.hash}`;

      navigate(
        "/profile/edit",
        {
          state: {
            returnTo,
          },
        },
      );
    }, [
      location.hash,
      location.pathname,
      location.search,
      navigate,
    ]);

  const showStoryNotice =
    useCallback(() => {
      setStoryNoticeOpen(true);
    }, []);

  const closeStoryNotice =
    useCallback(() => {
      setStoryNoticeOpen(false);
    }, []);

  const closeProfileSheet =
    useCallback(() => {
      setProfileSheetOpen(false);
    }, []);

  const {
    dismiss: dismissProfileSheet,
  } = useBackDismiss({
    isOpen: profileSheetOpen,
    onDismiss: closeProfileSheet,
    stateKey: "own-profile-options",
  });

  const copyProfileLink =
    useCallback(async () => {
      const userID = String(
        user?.id ?? "",
      ).trim();

      if (!userID) return;

      const profileURL = new URL(
        `/profile/${encodeURIComponent(
          userID,
        )}`,
        window.location.origin,
      ).toString();

      try {
        let copied = false;

        if (
          navigator.clipboard &&
          window.isSecureContext
        ) {
          try {
            await navigator.clipboard.writeText(
              profileURL,
            );
            copied = true;
          } catch {
            copied = false;
          }
        }

        if (!copied) {
          const textArea =
            document.createElement(
              "textarea",
            );

          textArea.value =
            profileURL;
          textArea.setAttribute(
            "readonly",
            "",
          );
          textArea.style.position =
            "fixed";
          textArea.style.opacity =
            "0";
          textArea.style.pointerEvents =
            "none";
          document.body.appendChild(
            textArea,
          );
          textArea.select();

          try {
            document.execCommand(
              "copy",
            );
          } finally {
            textArea.remove();
          }
        }
      } finally {
        dismissProfileSheet();
      }
    }, [
      dismissProfileSheet,
      user?.id,
    ]);

  const normalizeUser =
    useCallback(
      (
        data:
          Partial<UserProfile>,
      ): UserProfile => {
        return {
          id:
            data.id ?? "",

          first_name:
            data.first_name ?? "",

          last_name:
            data.last_name ?? "",

          followers_count:
            Number(
              data.followers_count ??
                0,
            ),

          following_count:
            Number(
              data.following_count ??
                0,
            ),

          posts_count:
            Number(
              data.posts_count ??
                0,
            ),

          bio:
            data.bio ?? "",

          profile_image_url:
            data.profile_image_url ??
            "",

          cover_image_url:
            data.cover_image_url ??
            "",
        };
      },
      [],
    );

  const setLoadingState =
    useCallback(
      (value: boolean) => {
        loadingRef.current =
          value;

        setPostsLoading(
          value,
        );
      },
      [],
    );

  const mergeUser =
    useCallback(
      (
        data:
          Partial<UserProfile>,
      ) => {
        setUser(
          (
            previousUser,
          ) => {
            if (
              !previousUser
            ) {
              return normalizeUser(
                data,
              );
            }

            return {
              ...previousUser,
              ...data,

              profile_image_url:
                data.profile_image_url ??
                previousUser.profile_image_url ??
                "",

              cover_image_url:
                data.cover_image_url ??
                previousUser.cover_image_url ??
                "",
            };
          },
        );
      },
      [normalizeUser],
    );

  const loadUser =
    useCallback(
      async () => {
        const data =
          await getCurrentUser();

        setUser(
          normalizeUser(data),
        );
      },
      [normalizeUser],
    );

  const loadProfilePosts =
    useCallback(
      async () => {
        try {
          setLoadingState(
            true,
          );

          const [
            mediaResponse,
            textResponse,
          ] =
            await Promise.all([
              getProfilePosts(
                "",
                PROFILE_POST_LIMIT,
              ),

              getMyTextPosts(
                "",
                PROFILE_POST_LIMIT,
              ),
            ]);

          setPosts(
            mergeUniquePosts([
              ...mediaResponse.posts,
              ...textResponse.posts,
            ]),
          );

          setMediaNextCursor(
            mediaResponse.next_cursor,
          );

          setTextNextCursor(
            textResponse.next_cursor,
          );

          setHasMoreMediaPosts(
            mediaResponse.has_more,
          );

          setHasMoreTextPosts(
            textResponse.has_more,
          );

          setInitialPostsLoaded(
            true,
          );
        } catch (error) {
          console.error(
            "Profile posts load failed:",
            error,
          );

          setInitialPostsLoaded(
            true,
          );
        } finally {
          setLoadingState(
            false,
          );
        }
      },
      [setLoadingState],
    );

  const loadMorePosts =
    useCallback(
      async () => {
        if (
          !hasMoreActivePosts ||
          loadingRef.current
        ) {
          return;
        }

        const shouldLoadMedia =
          hasMoreMediaPosts &&
          Boolean(
            mediaNextCursor,
          );

        const shouldLoadText =
          activeTab === "all" &&
          hasMoreTextPosts &&
          Boolean(
            textNextCursor,
          );

        if (
          !shouldLoadMedia &&
          !shouldLoadText
        ) {
          if (
            hasMoreMediaPosts
          ) {
            setHasMoreMediaPosts(
              false,
            );
          }

          if (
            activeTab === "all" &&
            hasMoreTextPosts
          ) {
            setHasMoreTextPosts(
              false,
            );
          }

          return;
        }

        try {
          setLoadingState(
            true,
          );

          const [
            mediaResponse,
            textResponse,
          ] =
            await Promise.all([
              shouldLoadMedia
                ? getProfilePosts(
                    mediaNextCursor,
                    PROFILE_POST_LIMIT,
                  )
                : Promise.resolve(
                    null,
                  ),

              shouldLoadText
                ? getMyTextPosts(
                    textNextCursor,
                    PROFILE_POST_LIMIT,
                  )
                : Promise.resolve(
                    null,
                  ),
            ]);

          setPosts(
            (
              previousPosts,
            ) =>
              mergeUniquePosts([
                ...previousPosts,
                ...(
                  mediaResponse
                    ?.posts ?? []
                ),
                ...(
                  textResponse
                    ?.posts ?? []
                ),
              ]),
          );

          if (mediaResponse) {
            setMediaNextCursor(
              mediaResponse.next_cursor,
            );

            setHasMoreMediaPosts(
              mediaResponse.has_more,
            );
          }

          if (textResponse) {
            setTextNextCursor(
              textResponse.next_cursor,
            );

            setHasMoreTextPosts(
              textResponse.has_more,
            );
          }
        } catch (error) {
          console.error(
            "More profile posts load failed:",
            error,
          );
        } finally {
          setLoadingState(
            false,
          );
        }
      },
      [
        activeTab,
        hasMoreActivePosts,
        hasMoreMediaPosts,
        hasMoreTextPosts,
        mediaNextCursor,
        textNextCursor,
        setLoadingState,
      ],
    );

  const refreshProfileAfterUpload =
    useCallback(
      async () => {
        await Promise.all([
          loadUser(),
          loadProfilePosts(),
        ]);
      },
      [
        loadProfilePosts,
        loadUser,
      ],
    );

  useEffect(() => {
    if (
      initialLoadStartedRef.current
    ) {
      return;
    }

    initialLoadStartedRef.current =
      true;

    loadUser().catch(
      (error) => {
        console.error(
          "Profile load failed:",
          error,
        );
      },
    );

    void loadProfilePosts();
  }, [
    loadProfilePosts,
    loadUser,
  ]);

  useEffect(() => {
    const handleNewPost = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<FeedPost>;

      const newPost =
        customEvent.detail;

      if (!newPost?.id) {
        return;
      }

      setPosts(
        (
          previousPosts,
        ) =>
          mergeUniquePosts([
            newPost,
            ...previousPosts,
          ]),
      );

      setUser(
        (
          previousUser,
        ) => {
          if (
            !previousUser
          ) {
            return previousUser;
          }

          return {
            ...previousUser,

            posts_count:
              Math.max(
                previousUser.posts_count +
                  1,
                posts.length + 1,
              ),
          };
        },
      );
    };

    window.addEventListener(
      "everest:new-post",
      handleNewPost,
    );

    return () => {
      window.removeEventListener(
        "everest:new-post",
        handleNewPost,
      );
    };
  }, [posts.length]);

  useEffect(() => {
    const target =
      observerRef.current;

    if (
      !target ||
      !hasMoreActivePosts
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries[0]
              ?.isIntersecting
          ) {
            void loadMorePosts();
          }
        },
        {
          root: null,
          rootMargin: "360px",
          threshold: 0.1,
        },
      );

    observer.observe(
      target,
    );

    return () => {
      observer.disconnect();
    };
  }, [
    hasMoreActivePosts,
    loadMorePosts,
  ]);

  const fullName =
    `${
      user?.first_name ?? ""
    } ${
      user?.last_name ?? ""
    }`.trim() ||
    "Everest User";

  const profileImageURL =
    user?.profile_image_url
      ?.trim() || "";

  const coverImageURL =
    user?.cover_image_url
      ?.trim() || "";

  const profileBio =
    user?.bio?.trim() ?? "";

  const totalPosts =
    Math.max(
      user?.posts_count ?? 0,
      posts.length,
    );

  const filteredPosts =
    useMemo(() => {
      if (
        activeTab === "videos"
      ) {
        return posts.filter(
          (post) =>
            postHasMediaType(
              post,
              "video",
            ),
        );
      }

      return posts;
    }, [
      activeTab,
      posts,
    ]);

  const profileHasPhotos =
    useMemo(
      () =>
        hasProfilePhotos(
          posts,
        ),
      [posts],
    );

  const visibleItemCount =
    activeTab === "photos"
      ? profileHasPhotos
        ? 1
        : 0
      : filteredPosts.length;

  const emptyStateTitle =
    activeTab === "photos"
      ? "No photos yet"
      : activeTab === "videos"
        ? "No videos yet"
        : "No posts yet";

  const EmptyStateIcon =
    activeTab === "photos"
      ? Images
      : activeTab === "videos"
        ? Video
        : FileText;

  const isImageFile = (
    file: File,
  ): boolean => {
    return file.type.startsWith(
      "image/",
    );
  };

  const handleProfileUpload =
    useCallback(
      async (
        event:
          ChangeEvent<HTMLInputElement>,
      ) => {
        const file =
          event.target.files?.[0];

        event.target.value =
          "";

        if (
          !file ||
          !isImageFile(file) ||
          profileUploading
        ) {
          return;
        }

        try {
          setProfileUploading(
            true,
          );

          const updatedUser =
            await uploadProfileImage(
              file,
            );

          if (
            updatedUser.profile_image_url
          ) {
            mergeUser({
              profile_image_url:
                updatedUser.profile_image_url,
            });
          }

          await refreshProfileAfterUpload();
        } catch (error) {
          console.error(
            "Profile upload failed:",
            error,
          );

          alert(
            "Profile image upload failed. Please try again.",
          );
        } finally {
          setProfileUploading(
            false,
          );
        }
      },
      [
        mergeUser,
        profileUploading,
        refreshProfileAfterUpload,
      ],
    );

  const handleCoverUpload =
    useCallback(
      async (
        event:
          ChangeEvent<HTMLInputElement>,
      ) => {
        const file =
          event.target.files?.[0];

        event.target.value =
          "";

        if (
          !file ||
          !isImageFile(file) ||
          coverUploading
        ) {
          return;
        }

        try {
          setCoverUploading(
            true,
          );

          const updatedUser =
            await uploadCoverImage(
              file,
            );

          if (
            updatedUser.cover_image_url
          ) {
            mergeUser({
              cover_image_url:
                updatedUser.cover_image_url,
            });
          }

          await refreshProfileAfterUpload();
        } catch (error) {
          console.error(
            "Cover upload failed:",
            error,
          );

          alert(
            "Cover image upload failed. Please try again.",
          );
        } finally {
          setCoverUploading(
            false,
          );
        }
      },
      [
        coverUploading,
        mergeUser,
        refreshProfileAfterUpload,
      ],
    );

  return (
    <div className="profilePage">
      <input
        id={
          PROFILE_INPUT_ID
        }
        type="file"
        accept="image/*"
        className="profileHiddenInput"
        onChange={
          handleProfileUpload
        }
      />

      <input
        id={
          COVER_INPUT_ID
        }
        type="file"
        accept="image/*"
        className="profileHiddenInput"
        onChange={
          handleCoverUpload
        }
      />

      <div className="profileWrapper">
        <div className="profileCover">

{coverUploading && (
  <div
    className="profileMediaUploadOverlay"
    role="status"
    aria-label="Uploading cover image"
  >
    <LoaderCircle
      className="profileMediaUploadSpinner"
      size={32}
      strokeWidth={3}
      aria-hidden="true"
    />
  </div>
)}

          {coverImageURL ? (
            <img
              src={
                coverImageURL
              }
              alt="Cover"
              className="profileCoverImage"
              loading="eager"
              decoding="async"
            />
          ) : null}

          <label
            htmlFor={
              COVER_INPUT_ID
            }
            className={`profileCoverCamera ${
              coverUploading
                ? "uploading"
                : ""
            }`}
            aria-label="Upload cover image"
          >
            <Camera
              size={20}
            />
          </label>
        </div>

        <div className="profileInfo">
          <div className="profileAvatarBox">
            <div className="profileAvatar">

{profileUploading && (
  <div
    className="profileMediaUploadOverlay"
    role="status"
    aria-label="Uploading profile image"
  >
    <LoaderCircle
      className="profileMediaUploadSpinner"
      size={32}
      strokeWidth={3}
      aria-hidden="true"
    />
  </div>
)}

              {profileImageURL ? (
                <img
                  src={
                    profileImageURL
                  }
                  alt={
                    fullName
                  }
                  className="profileAvatarImage"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <User
                  size={108}
                  strokeWidth={
                    3.5
                  }
                />
              )}
            </div>

            <label
              htmlFor={
                PROFILE_INPUT_ID
              }
              className={`profileAvatarCamera ${
                profileUploading
                  ? "uploading"
                  : ""
              }`}
              aria-label="Upload profile image"
            >
              <Camera
                size={16}
              />
            </label>
          </div>

          <VerifiedName
            as="h1"
            className="profileName"
            userID={
              user?.id ?? ""
            }
            name={fullName}
            badgeSize="lg"
          />

          <div className="profileStats">
            <Link
              to="/profile-connections/me/followers"
              aria-label={`View ${
                user?.followers_count ??
                0
              } followers`}
              style={{
                color:
                  "inherit",
                textDecoration:
                  "none",
              }}
            >
              <strong>
                {
                  user?.followers_count ??
                  0
                }
              </strong>{" "}
              followers
            </Link>

            <span>•</span>

            <Link
              to="/profile-connections/me/following"
              aria-label={`View ${
                user?.following_count ??
                0
              } following`}
              style={{
                color:
                  "inherit",
                textDecoration:
                  "none",
              }}
            >
              <strong>
                {
                  user?.following_count ??
                  0
                }
              </strong>{" "}
              following
            </Link>

            <span>•</span>

            <span>
              <strong>
                {totalPosts}
              </strong>{" "}
              post
            </span>
          </div>

          {profileBio ? (
            <p className="profileBio">
              {profileBio}
            </p>
          ) : null}

          <div className="profileActions">
            <button
              className="profileStoryBtn"
              type="button"
              onClick={showStoryNotice}
            >
              <CirclePlus
                size={20}
              />

              Add Story
            </button>

            <button
              className="profileEditBtn"
              type="button"
              onClick={openEditProfile}
            >
              <User
                size={20}
              />

              Edit Profile
            </button>

            <button
              className="profileMoreBtn"
              type="button"
              aria-label="More profile options"
              aria-expanded={
                profileSheetOpen
              }
              aria-controls="own-profile-options"
              onClick={() =>
                setProfileSheetOpen(
                  true,
                )
              }
            >
              <MoreHorizontal
                size={24}
              />
            </button>
          </div>

          <div
            className="profileTabs"
            role="tablist"
            aria-label="Profile posts"
          >
            {(
              [
                [
                  "all",
                  "All",
                ],
                [
                  "photos",
                  "Photos",
                ],
                [
                  "videos",
                  "Videos",
                ],
              ] as const
            ).map(
              ([
                tabValue,
                tabLabel,
              ]) => (
                <button
                  key={
                    tabValue
                  }
                  type="button"
                  role="tab"
                  aria-selected={
                    activeTab ===
                    tabValue
                  }
                  className={
                    activeTab ===
                    tabValue
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveTab(
                      tabValue,
                    )
                  }
                >
                  {tabLabel}
                </button>
              ),
            )}
          </div>

          <div
            className={`profilePosts ${
              activeTab ===
              "photos"
                ? "isPhotoGallery"
                : activeTab ===
                    "videos"
                  ? "isVideoGallery"
                  : ""
            }`}
            aria-label={`${fullName}'s ${activeTab}`}
          >
            {activeTab ===
            "photos" ? (
              <ProfilePhotoGallery
                posts={posts}
                ownerName={
                  fullName
                }
              />
            ) : activeTab ===
              "videos" ? (
              <ProfileVideoGallery
                posts={posts}
                ownerName={
                  fullName
                }
              />
            ) : (
              filteredPosts.map(
                (post) => (
                  <Post
                    key={
                      post.id
                    }
                    post={post}
                  />
                ),
              )
            )}

            {postsLoading &&
            posts.length === 0 ? (
              activeTab ===
              "photos" ? (
                <ProfilePhotoGallerySkeleton />
              ) : activeTab ===
                "videos" ? (
                <ProfileVideoGallerySkeleton />
              ) : (
                <ProfileFeedSkeleton />
              )
            ) : null}

            <div
              ref={observerRef}
              className="profileFeedObserver"
            />

            {postsLoading &&
            posts.length > 0 ? (
              activeTab ===
                "photos" ||
              activeTab ===
                "videos" ? (
                <div
                  className="profilePhotoLoading"
                  role="status"
                  aria-label={`Loading more ${activeTab}`}
                >
                  <LoaderCircle
                    size={24}
                  />
                </div>
              ) : (
                <div className="profileFeedMoreSkeleton">
                  <div />
                  <div />
                  <div />
                </div>
              )
            ) : null}

            {initialPostsLoaded &&
            !postsLoading &&
            visibleItemCount ===
              0 &&
            !hasMoreActivePosts ? (
              <div className="profileEmpty">
                <EmptyStateIcon
                  size={62}
                  strokeWidth={
                    1.6
                  }
                />

                <h2>
                  {
                    emptyStateTitle
                  }
                </h2>

                <p>
                  {activeTab ===
                  "all"
                    ? "Share your moments with the world."
                    : `Your ${activeTab} will appear here.`}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {profileSheetOpen ? (
        <div
          className="profileViewSheetBackdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              dismissProfileSheet();
            }
          }}
        >
          <section
            id="own-profile-options"
            className="profileViewBottomSheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="own-profile-options-title"
          >
            <div
              className="profileViewSheetHandle"
              aria-hidden="true"
            />

            <header className="profileViewSheetHeader">
              <h2 id="own-profile-options-title">
                Profile options
              </h2>

              <button
                type="button"
                aria-label="Close profile options"
                onClick={
                  dismissProfileSheet
                }
              >
                <X size={21} />
              </button>
            </header>

            <button
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
                <strong>
                  Copy profile link
                </strong>
                <small>
                  Copy a direct link to
                  your profile
                </small>
              </span>
            </button>
          </section>
        </div>
      ) : null}

      <PostActionToast
        open={storyNoticeOpen}
        message="This feature is currently unavailable."
        tone="info"
        onClose={closeStoryNotice}
      />
    </div>
  );
};

export default memo(
  Profile,
);