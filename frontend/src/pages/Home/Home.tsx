import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";
import BottomNav from "../../components/BottomNav/BottomNav";
import Post from "../../components/Post/Post";
import ReelsPreviewSection from "../../components/Reels/ReelsPreviewSection";

import useFeedScrollRestoration from "../../hooks/useFeedScrollRestoration";

import {
  getFeedPosts,
} from "../../services/postService";

import type {
  FeedPost,
} from "../../services/postService";

import {
  getTextFeedPosts,
} from "../../components/textpost/textPostService";

import "./Home.css";

type HomeLocationState = {
  instantPost?: FeedPost;
};

const FEED_LIMIT = 6;
const REELS_INSERT_INDEX = 4;
const REELS_PREVIEW_LIMIT = 10;

const isVideoPost = (
  post: FeedPost
): boolean => {
  const postType = (
    post.type || ""
  )
    .trim()
    .toLowerCase();

  const legacyMediaType = (
    post.media_type || ""
  )
    .trim()
    .toLowerCase();

  if (
    postType === "video" ||
    legacyMediaType === "video"
  ) {
    return true;
  }

  return Array.isArray(
    post.media
  )
    ? post.media.some(
        (mediaItem) =>
          mediaItem.type ===
          "video"
      )
    : false;
};

const getPostCreatedTime = (
  post: FeedPost
): number => {
  const time = new Date(
    post.created_at
  ).getTime();

  return Number.isFinite(time)
    ? time
    : 0;
};

const mergePostData = (
  existingPost: FeedPost,
  incomingPost: FeedPost
): FeedPost => {
  if (
    incomingPost.type ===
    "text"
  ) {
    return {
      ...existingPost,
      ...incomingPost,

      text:
        incomingPost.text ??
        existingPost.text,

      caption:
        incomingPost.caption ??
        existingPost.caption,

      text_background:
        incomingPost.text_background ??
        existingPost.text_background,

      text_color:
        incomingPost.text_color ??
        existingPost.text_color,

      text_style:
        incomingPost.text_style ??
        existingPost.text_style,
    };
  }

  return existingPost;
};

const mergeUniquePosts = (
  orderedPosts: FeedPost[]
): FeedPost[] => {
  const postMap =
    new Map<
      string,
      FeedPost
    >();

  orderedPosts.forEach(
    (post) => {
      /*
       * Backend Home feed video বাদ দিলেও
       * frontend-এ দ্বিতীয় safety layer রাখা হয়েছে।
       */
      if (
        !post.id ||
        isVideoPost(post)
      ) {
        return;
      }

      const existingPost =
        postMap.get(post.id);

      if (!existingPost) {
        postMap.set(
          post.id,
          post
        );

        return;
      }

      postMap.set(
        post.id,
        mergePostData(
          existingPost,
          post
        )
      );
    }
  );

  return Array.from(
    postMap.values()
  ).sort(
    (
      firstPost,
      secondPost
    ) =>
      getPostCreatedTime(
        secondPost
      ) -
      getPostCreatedTime(
        firstPost
      )
  );
};

const HomeFeedSkeleton = () => {
  return (
    <>
      {Array.from({
        length: 3,
      }).map(
        (_, index) => (
          <article
            className="homePostSkeleton"
            key={index}
          >
            <div className="homeSkeletonHeader">
              <div className="homeSkeletonAvatar" />

              <div className="homeSkeletonText">
                <div className="homeSkeletonLine short" />
                <div className="homeSkeletonLine tiny" />
              </div>
            </div>

            <div className="homeSkeletonMedia" />
            <div className="homeSkeletonActions" />
          </article>
        )
      )}
    </>
  );
};

const Home = () => {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const observerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const initialLoadStartedRef =
    useRef(false);

  const loadingRef =
    useRef(false);

  const [
    posts,
    setPosts,
  ] = useState<FeedPost[]>(
    []
  );

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
    initialLoaded,
    setInitialLoaded,
  ] = useState(false);

  const [
    reelsSectionVersion,
    setReelsSectionVersion,
  ] = useState(0);

  const routeState =
    location.state as
      | HomeLocationState
      | null;

  const instantPost =
    routeState?.instantPost;

  const hasMorePosts =
    hasMoreMediaPosts ||
    hasMoreTextPosts;

  /*
   * Browser Back দিয়ে Reels থেকে Home-এ ফিরলে
   * আগের Home scroll position restore হবে।
   */
  useFeedScrollRestoration({
    pageKey: "home-feed",
    ready: initialLoaded,
  });

  const setLoadingState =
    useCallback(
      (value: boolean) => {
        loadingRef.current =
          value;

        setPostsLoading(
          value
        );
      },
      []
    );

  const loadInitialPosts =
    useCallback(async () => {
      if (
        initialLoadStartedRef.current
      ) {
        return;
      }

      initialLoadStartedRef.current =
        true;

      try {
        setLoadingState(true);

        const [
          mediaResponse,
          textResponse,
        ] =
          await Promise.all([
            getFeedPosts(
              "",
              FEED_LIMIT
            ),

            getTextFeedPosts(
              "",
              FEED_LIMIT
            ),
          ]);

        setPosts(
          (
            previousPosts
          ) =>
            mergeUniquePosts([
              ...previousPosts,
              ...mediaResponse.posts,
              ...textResponse.posts,
            ])
        );

        setMediaNextCursor(
          mediaResponse.next_cursor
        );

        setTextNextCursor(
          textResponse.next_cursor
        );

        setHasMoreMediaPosts(
          mediaResponse.has_more
        );

        setHasMoreTextPosts(
          textResponse.has_more
        );

        setInitialLoaded(
          true
        );
      } catch (error) {
        console.error(
          "Home feed load failed:",
          error
        );

        setInitialLoaded(
          true
        );
      } finally {
        setLoadingState(
          false
        );
      }
    }, [setLoadingState]);

  const loadMorePosts =
    useCallback(async () => {
      if (
        !hasMorePosts ||
        loadingRef.current
      ) {
        return;
      }

      const shouldLoadMedia =
        hasMoreMediaPosts &&
        Boolean(
          mediaNextCursor
        );

      const shouldLoadText =
        hasMoreTextPosts &&
        Boolean(
          textNextCursor
        );

      if (
        !shouldLoadMedia &&
        !shouldLoadText
      ) {
        return;
      }

      try {
        setLoadingState(true);

        const [
          mediaResponse,
          textResponse,
        ] =
          await Promise.all([
            shouldLoadMedia
              ? getFeedPosts(
                  mediaNextCursor,
                  FEED_LIMIT
                )
              : Promise.resolve(
                  null
                ),

            shouldLoadText
              ? getTextFeedPosts(
                  textNextCursor,
                  FEED_LIMIT
                )
              : Promise.resolve(
                  null
                ),
          ]);

        setPosts(
          (
            previousPosts
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
            ])
        );

        if (
          mediaResponse
        ) {
          setMediaNextCursor(
            mediaResponse.next_cursor
          );

          setHasMoreMediaPosts(
            mediaResponse.has_more
          );
        }

        if (
          textResponse
        ) {
          setTextNextCursor(
            textResponse.next_cursor
          );

          setHasMoreTextPosts(
            textResponse.has_more
          );
        }
      } catch (error) {
        console.error(
          "More feed posts load failed:",
          error
        );
      } finally {
        setLoadingState(
          false
        );
      }
    }, [
      hasMorePosts,
      hasMoreMediaPosts,
      hasMoreTextPosts,
      mediaNextCursor,
      textNextCursor,
      setLoadingState,
    ]);

  /*
   * Upload page থেকে ফিরে আসা instant video normal
   * Home post-এ যোগ হবে না। Reels section নিজে
   * database থেকে নতুন video আনবে।
   */
  useEffect(() => {
    if (
      !instantPost?.id
    ) {
      return;
    }

    if (
      !isVideoPost(
        instantPost
      )
    ) {
      setPosts(
        (
          previousPosts
        ) =>
          mergeUniquePosts([
            instantPost,
            ...previousPosts,
          ])
      );
    }

    navigate("/", {
      replace: true,
      state: null,
    });
  }, [
    instantPost,
    navigate,
  ]);

  useEffect(() => {
    void loadInitialPosts();
  }, [loadInitialPosts]);

  /*
   * Current browser session-এ নতুন post event এলে
   * video শুধু Reels preview refresh করবে।
   */
  useEffect(() => {
    const handleNewPost = (
      event: Event
    ) => {
      const customEvent =
        event as CustomEvent<FeedPost>;

      const newPost =
        customEvent.detail;

      if (!newPost?.id) {
        return;
      }

      if (
        isVideoPost(
          newPost
        )
      ) {
        setReelsSectionVersion(
          (
            currentVersion
          ) =>
            currentVersion + 1
        );

        return;
      }

      setPosts(
        (
          previousPosts
        ) =>
          mergeUniquePosts([
            newPost,
            ...previousPosts,
          ])
      );
    };

    window.addEventListener(
      "everest:new-post",
      handleNewPost
    );

    return () => {
      window.removeEventListener(
        "everest:new-post",
        handleNewPost
      );
    };
  }, []);

  useEffect(() => {
    const target =
      observerRef.current;

    if (!target) {
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
          rootMargin:
            "360px",
          threshold: 0.1,
        }
      );

    observer.observe(
      target
    );

    return () => {
      observer.disconnect();
    };
  }, [loadMorePosts]);

  const postsBeforeReels =
    posts.slice(
      0,
      REELS_INSERT_INDEX
    );

  const postsAfterReels =
    posts.slice(
      REELS_INSERT_INDEX
    );

  const shouldShowReelsSection =
    posts.length >=
    REELS_INSERT_INDEX;

  return (
    <>
      <Navbar />

      <main className="homePage">
        <section className="homeFeed">
          {postsBeforeReels.map(
            (post) => (
              <Post
                key={post.id}
                post={post}
                showFollowAction
              />
            )
          )}

          {shouldShowReelsSection ? (
            <ReelsPreviewSection
              key={`home-reels-${reelsSectionVersion}`}
              limit={
                REELS_PREVIEW_LIMIT
              }
            />
          ) : null}

          {postsAfterReels.map(
            (post) => (
              <Post
                key={post.id}
                post={post}
                showFollowAction
              />
            )
          )}

          {postsLoading &&
          posts.length === 0 ? (
            <HomeFeedSkeleton />
          ) : null}

          <div
            ref={observerRef}
            className="homeFeedObserver"
          />

          {postsLoading &&
          posts.length > 0 ? (
            <div className="homeFeedMoreSkeleton">
              <div />
              <div />
              <div />
            </div>
          ) : null}

          {initialLoaded &&
          !postsLoading &&
          posts.length === 0 ? (
            <div className="homeFeedEmpty">
              <h2>
                No posts yet
              </h2>

              <p>
                New posts will
                appear here.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      <BottomNav />
    </>
  );
};

export default memo(Home);