import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Camera,
  CirclePlus,
  FileText,
  MoreHorizontal,
  User,
} from "lucide-react";
import Post from "../../components/Post/Post";
import { getCurrentUser } from "../../services/userService";
import {
  uploadCoverImage,
  uploadProfileImage,
} from "../../services/profileMediaService";
import { getProfilePosts, type FeedPost } from "../../services/postService";
import { getMyTextPosts } from "../../components/textpost/textPostService";
import "./Profile.css";

type UserProfile = {
  id?: string;
  first_name: string;
  last_name: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  profile_image_url?: string;
  cover_image_url?: string;
};

const PROFILE_INPUT_ID = "profile-image-input";
const COVER_INPUT_ID = "cover-image-input";
const PROFILE_POST_LIMIT = 6;

const getPostCreatedTime = (post: FeedPost) => {
  const time = new Date(post.created_at).getTime();
  return Number.isFinite(time) ? time : 0;
};

const isTextPost = (post: FeedPost) => {
  return (
    post.type === "text" ||
    Boolean(post.text) ||
    Boolean(post.text_background) ||
    Boolean(post.text_color) ||
    Boolean(post.text_style)
  );
};

const mergePostData = (existingPost: FeedPost, incomingPost: FeedPost) => {
  if (isTextPost(incomingPost)) {
    return {
      ...existingPost,
      ...incomingPost,
      type: incomingPost.type || existingPost.type || "text",
      caption: incomingPost.caption ?? existingPost.caption,
      text: incomingPost.text ?? existingPost.text,
      text_background:
        incomingPost.text_background ?? existingPost.text_background,
      text_color: incomingPost.text_color ?? existingPost.text_color,
      text_style: incomingPost.text_style ?? existingPost.text_style,
      media:
        incomingPost.media && incomingPost.media.length > 0
          ? incomingPost.media
          : existingPost.media,
      media_url: incomingPost.media_url || existingPost.media_url,
      media_id: incomingPost.media_id || existingPost.media_id,
      media_type: incomingPost.media_type || existingPost.media_type,
    };
  }

  return {
    ...existingPost,
    ...incomingPost,
    media:
      incomingPost.media && incomingPost.media.length > 0
        ? incomingPost.media
        : existingPost.media,
  };
};

const mergeUniquePosts = (orderedPosts: FeedPost[]) => {
  const map = new Map<string, FeedPost>();

  orderedPosts.forEach((post) => {
    if (!post.id) return;

    const existingPost = map.get(post.id);

    if (!existingPost) {
      map.set(post.id, post);
      return;
    }

    map.set(post.id, mergePostData(existingPost, post));
  });

  return Array.from(map.values()).sort(
    (a, b) => getPostCreatedTime(b) - getPostCreatedTime(a)
  );
};

const ProfileFeedSkeleton = () => {
  return (
    <div className="profileFeedSkeleton">
      {Array.from({ length: 3 }).map((_, index) => (
        <article className="profilePostSkeleton" key={index}>
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
  const observerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const initialLoadStartedRef = useRef(false);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);

  const [mediaNextCursor, setMediaNextCursor] = useState("");
  const [textNextCursor, setTextNextCursor] = useState("");

  const [hasMoreMediaPosts, setHasMoreMediaPosts] = useState(false);
  const [hasMoreTextPosts, setHasMoreTextPosts] = useState(false);

  const [postsLoading, setPostsLoading] = useState(false);
  const [initialPostsLoaded, setInitialPostsLoaded] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const hasMorePosts = hasMoreMediaPosts || hasMoreTextPosts;

  const normalizeUser = useCallback((data: Partial<UserProfile>): UserProfile => {
    return {
      id: data.id ?? "",
      first_name: data.first_name ?? "",
      last_name: data.last_name ?? "",
      followers_count: Number(data.followers_count ?? 0),
      following_count: Number(data.following_count ?? 0),
      posts_count: Number(data.posts_count ?? 0),
      profile_image_url: data.profile_image_url ?? "",
      cover_image_url: data.cover_image_url ?? "",
    };
  }, []);

  const setLoadingState = useCallback((value: boolean) => {
    loadingRef.current = value;
    setPostsLoading(value);
  }, []);

  const mergeUser = useCallback(
    (data: Partial<UserProfile>) => {
      setUser((previousUser) => {
        if (!previousUser) {
          return normalizeUser(data);
        }

        return {
          ...previousUser,
          ...data,
          profile_image_url:
            data.profile_image_url ?? previousUser.profile_image_url ?? "",
          cover_image_url:
            data.cover_image_url ?? previousUser.cover_image_url ?? "",
        };
      });
    },
    [normalizeUser]
  );

  const loadUser = useCallback(async () => {
    const data = await getCurrentUser();
    setUser(normalizeUser(data));
  }, [normalizeUser]);

  const loadProfilePosts = useCallback(async () => {
    try {
      setLoadingState(true);

      const [mediaResponse, textResponse] = await Promise.all([
        getProfilePosts("", PROFILE_POST_LIMIT),
        getMyTextPosts("", PROFILE_POST_LIMIT),
      ]);

      setPosts(
        mergeUniquePosts([
          ...mediaResponse.posts,
          ...textResponse.posts,
        ])
      );

      setMediaNextCursor(mediaResponse.next_cursor);
      setTextNextCursor(textResponse.next_cursor);

      setHasMoreMediaPosts(mediaResponse.has_more);
      setHasMoreTextPosts(textResponse.has_more);

      setInitialPostsLoaded(true);
    } catch (error) {
      console.error("Profile posts load failed:", error);
      setInitialPostsLoaded(true);
    } finally {
      setLoadingState(false);
    }
  }, [setLoadingState]);

  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || loadingRef.current) return;

    const shouldLoadMedia = hasMoreMediaPosts && Boolean(mediaNextCursor);
    const shouldLoadText = hasMoreTextPosts && Boolean(textNextCursor);

    if (!shouldLoadMedia && !shouldLoadText) return;

    try {
      setLoadingState(true);

      const [mediaResponse, textResponse] = await Promise.all([
        shouldLoadMedia
          ? getProfilePosts(mediaNextCursor, PROFILE_POST_LIMIT)
          : Promise.resolve(null),
        shouldLoadText
          ? getMyTextPosts(textNextCursor, PROFILE_POST_LIMIT)
          : Promise.resolve(null),
      ]);

      setPosts((previousPosts) =>
        mergeUniquePosts([
          ...previousPosts,
          ...(mediaResponse?.posts ?? []),
          ...(textResponse?.posts ?? []),
        ])
      );

      if (mediaResponse) {
        setMediaNextCursor(mediaResponse.next_cursor);
        setHasMoreMediaPosts(mediaResponse.has_more);
      }

      if (textResponse) {
        setTextNextCursor(textResponse.next_cursor);
        setHasMoreTextPosts(textResponse.has_more);
      }
    } catch (error) {
      console.error("More profile posts load failed:", error);
    } finally {
      setLoadingState(false);
    }
  }, [
    hasMorePosts,
    hasMoreMediaPosts,
    hasMoreTextPosts,
    mediaNextCursor,
    textNextCursor,
    setLoadingState,
  ]);

  const refreshProfileAfterUpload = useCallback(async () => {
    await Promise.all([loadUser(), loadProfilePosts()]);
  }, [loadProfilePosts, loadUser]);

  useEffect(() => {
    if (initialLoadStartedRef.current) return;

    initialLoadStartedRef.current = true;

    loadUser().catch((error) => {
      console.error("Profile load failed:", error);
    });

    loadProfilePosts();
  }, [loadProfilePosts, loadUser]);

  useEffect(() => {
    const handleNewPost = (event: Event) => {
      const customEvent = event as CustomEvent<FeedPost>;
      const newPost = customEvent.detail;

      if (!newPost?.id) return;

      setPosts((previousPosts) =>
        mergeUniquePosts([newPost, ...previousPosts])
      );

      setUser((previousUser) => {
        if (!previousUser) return previousUser;

        return {
          ...previousUser,
          posts_count: Math.max(previousUser.posts_count + 1, posts.length + 1),
        };
      });
    };

    window.addEventListener("everest:new-post", handleNewPost);

    return () => {
      window.removeEventListener("everest:new-post", handleNewPost);
    };
  }, [posts.length]);

  useEffect(() => {
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMorePosts();
        }
      },
      {
        root: null,
        rootMargin: "360px",
        threshold: 0.1,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [loadMorePosts]);

  const fullName =
    `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() ||
    "Everest User";

  const profileImageURL = user?.profile_image_url?.trim() || "";
  const coverImageURL = user?.cover_image_url?.trim() || "";
  const totalPosts = Math.max(user?.posts_count ?? 0, posts.length);

  const isImageFile = (file: File) => file.type.startsWith("image/");

  const handleProfileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || !isImageFile(file) || profileUploading) return;

      try {
        setProfileUploading(true);

        const updatedUser = await uploadProfileImage(file);

        if (updatedUser.profile_image_url) {
          mergeUser({
            profile_image_url: updatedUser.profile_image_url,
          });
        }

        await refreshProfileAfterUpload();
      } catch (error) {
        console.error("Profile upload failed:", error);
        alert("Profile image upload failed. Please try again.");
      } finally {
        setProfileUploading(false);
      }
    },
    [mergeUser, profileUploading, refreshProfileAfterUpload]
  );

  const handleCoverUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || !isImageFile(file) || coverUploading) return;

      try {
        setCoverUploading(true);

        const updatedUser = await uploadCoverImage(file);

        if (updatedUser.cover_image_url) {
          mergeUser({
            cover_image_url: updatedUser.cover_image_url,
          });
        }

        await refreshProfileAfterUpload();
      } catch (error) {
        console.error("Cover upload failed:", error);
        alert("Cover image upload failed. Please try again.");
      } finally {
        setCoverUploading(false);
      }
    },
    [coverUploading, mergeUser, refreshProfileAfterUpload]
  );

  return (
    <div className="profilePage">
      <input
        id={PROFILE_INPUT_ID}
        type="file"
        accept="image/*"
        className="profileHiddenInput"
        onChange={handleProfileUpload}
      />

      <input
        id={COVER_INPUT_ID}
        type="file"
        accept="image/*"
        className="profileHiddenInput"
        onChange={handleCoverUpload}
      />

      <div className="profileWrapper">
        <div className="profileCover">
          {coverImageURL ? (
            <img
              src={coverImageURL}
              alt="Cover"
              className="profileCoverImage"
              loading="eager"
              decoding="async"
            />
          ) : null}

          <label
            htmlFor={COVER_INPUT_ID}
            className={`profileCoverCamera ${
              coverUploading ? "uploading" : ""
            }`}
            aria-label="Upload cover image"
          >
            <Camera size={20} />
          </label>
        </div>

        <div className="profileInfo">
          <div className="profileAvatarBox">
            <div className="profileAvatar">
              {profileImageURL ? (
                <img
                  src={profileImageURL}
                  alt={fullName}
                  className="profileAvatarImage"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <User size={108} strokeWidth={1.8} />
              )}
            </div>

            <label
              htmlFor={PROFILE_INPUT_ID}
              className={`profileAvatarCamera ${
                profileUploading ? "uploading" : ""
              }`}
              aria-label="Upload profile image"
            >
              <Camera size={16} />
            </label>
          </div>

          <h1 className="profileName">{fullName}</h1>

          <div className="profileStats">
            <span>
              <strong>{user?.followers_count ?? 0}</strong> followers
            </span>
            <span>•</span>
            <span>
              <strong>{user?.following_count ?? 0}</strong> following
            </span>
            <span>•</span>
            <span>
              <strong>{totalPosts}</strong> post
            </span>
          </div>

          <div className="profileActions">
            <button className="profileStoryBtn" type="button">
              <CirclePlus size={20} />
              Add Story
            </button>

            <button className="profileEditBtn" type="button">
              <User size={20} />
              Edit Profile
            </button>

            <button
              className="profileMoreBtn"
              type="button"
              aria-label="More profile options"
            >
              <MoreHorizontal size={24} />
            </button>
          </div>

          <div className="profileTabs">
            <button type="button" className="active">
              All
            </button>
            <button type="button">Photos</button>
            <button type="button">Videos</button>
          </div>

          <div className="profilePosts">
            {posts.map((post) => (
              <Post key={post.id} post={post} />
            ))}

            {postsLoading && posts.length === 0 ? <ProfileFeedSkeleton /> : null}

            <div ref={observerRef} className="profileFeedObserver" />

            {postsLoading && posts.length > 0 ? (
              <div className="profileFeedMoreSkeleton">
                <div />
                <div />
                <div />
              </div>
            ) : null}

            {initialPostsLoaded && !postsLoading && posts.length === 0 ? (
              <div className="profileEmpty">
                <FileText size={62} strokeWidth={1.6} />
                <h2>No posts yet</h2>
                <p>Share your moments with the world.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(Profile);