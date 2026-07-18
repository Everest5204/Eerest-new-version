/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  FeedPost,
} from "../../services/postService";

type PostEditNoticeStatus =
  | "saving"
  | "success"
  | "error";

type PostEditNotice = {
  id: number;
  status: PostEditNoticeStatus;
  message: string;
};

type PostEditOverride = {
  operationId: string;

  post: FeedPost;
  rollbackPost: FeedPost;

  pending: boolean;
};

type PostEditActions = {
  beginOptimisticEdit: (
    originalPost: FeedPost,
    optimisticPost: FeedPost
  ) => string;

  commitOptimisticEdit: (
    postId: string,
    operationId: string,
    savedPost: FeedPost
  ) => void;

  rollbackOptimisticEdit: (
    postId: string,
    operationId: string
  ) => void;

  clearPostEditOverride: (
    postId: string
  ) => void;

  clearPostEditNotice: () => void;
};

const PostEditActionsContext =
  createContext<PostEditActions | null>(
    null
  );

const PostEditOverridesContext =
  createContext<
    ReadonlyMap<string, PostEditOverride>
  >(new Map());

const PostEditProviderNoticeContext =
  createContext<PostEditNotice | null>(
    null
  );

const getPostTimestamp = (
  post: FeedPost
): number => {
  const timestamp = new Date(
    post.updated_at
  ).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : 0;
};

export const PostEditProvider = ({
  children,
}: PropsWithChildren) => {
  const overridesRef = useRef<
    Map<string, PostEditOverride>
  >(new Map());

  const operationSequenceRef =
    useRef(0);

  const noticeSequenceRef =
    useRef(0);

  const [
    postOverrides,
    setPostOverrides,
  ] = useState<
    ReadonlyMap<string, PostEditOverride>
  >(() => new Map());

  const [
    notice,
    setNotice,
  ] = useState<PostEditNotice | null>(
    null
  );

  const publishNotice = useCallback(
    (
      status: PostEditNoticeStatus,
      message: string
    ) => {
      const nextNotice: PostEditNotice = {
        id:
          ++noticeSequenceRef.current,
        status,
        message,
      };

      setNotice(nextNotice);
    },
    []
  );

  const updateOverrides = useCallback(
    (
      nextOverrides: Map<
        string,
        PostEditOverride
      >
    ) => {
      overridesRef.current =
        nextOverrides;

      setPostOverrides(
        nextOverrides
      );
    },
    []
  );

  const beginOptimisticEdit =
    useCallback(
      (
        originalPost: FeedPost,
        optimisticPost: FeedPost
      ): string => {
        const operationId =
          `post-edit-${Date.now()}-${
            ++operationSequenceRef.current
          }`;

        const currentOverride =
          overridesRef.current.get(
            optimisticPost.id
          );

        // If another edit is already pending,
        // always preserve the last confirmed
        // post for a safe rollback.
        const rollbackPost =
          currentOverride?.pending
            ? currentOverride.rollbackPost
            : originalPost;

        const nextOverrides =
          new Map(
            overridesRef.current
          );

        nextOverrides.set(
          optimisticPost.id,
          {
            operationId,
            post: optimisticPost,
            rollbackPost,
            pending: true,
          }
        );

        updateOverrides(
          nextOverrides
        );

        publishNotice(
          "saving",
          "Saving post changes…"
        );

        return operationId;
      },
      [
        publishNotice,
        updateOverrides,
      ]
    );

  const commitOptimisticEdit =
    useCallback(
      (
        postId: string,
        operationId: string,
        savedPost: FeedPost
      ) => {
        const currentOverride =
          overridesRef.current.get(
            postId
          );

        // Ignores an old API response if a
        // newer edit operation already exists.
        if (
          !currentOverride ||
          currentOverride.operationId !==
            operationId
        ) {
          return;
        }

        const nextOverrides =
          new Map(
            overridesRef.current
          );

        nextOverrides.set(postId, {
          operationId,
          post: savedPost,
          rollbackPost: savedPost,
          pending: false,
        });

        updateOverrides(
          nextOverrides
        );

        publishNotice(
          "success",
          "Post updated successfully"
        );
      },
      [
        publishNotice,
        updateOverrides,
      ]
    );

  const rollbackOptimisticEdit =
    useCallback(
      (
        postId: string,
        operationId: string
      ) => {
        const currentOverride =
          overridesRef.current.get(
            postId
          );

        if (
          !currentOverride ||
          currentOverride.operationId !==
            operationId
        ) {
          return;
        }

        const rollbackPost =
          currentOverride.rollbackPost;

        const nextOverrides =
          new Map(
            overridesRef.current
          );

        nextOverrides.set(postId, {
          operationId,
          post: rollbackPost,
          rollbackPost,
          pending: false,
        });

        updateOverrides(
          nextOverrides
        );

        publishNotice(
          "error",
          "Update failed. Previous post restored."
        );
      },
      [
        publishNotice,
        updateOverrides,
      ]
    );

  const clearPostEditOverride =
    useCallback(
      (postId: string) => {
        const cleanPostId =
          postId.trim();

        if (
          !cleanPostId ||
          !overridesRef.current.has(
            cleanPostId
          )
        ) {
          return;
        }

        const nextOverrides =
          new Map(
            overridesRef.current
          );

        nextOverrides.delete(
          cleanPostId
        );

        updateOverrides(
          nextOverrides
        );
      },
      [updateOverrides]
    );

  const clearPostEditNotice =
    useCallback(() => {
      setNotice(null);
    }, []);

  // Success and error messages disappear
  // automatically. Saving remains visible
  // until the request finishes.
  useEffect(() => {
    if (
      !notice ||
      notice.status === "saving"
    ) {
      return;
    }

    const hideAfter =
      notice.status === "success"
        ? 2_600
        : 5_200;

    const timeoutId =
      window.setTimeout(() => {
        setNotice(
          (currentNotice) =>
            currentNotice?.id ===
            notice.id
              ? null
              : currentNotice
        );
      }, hideAfter);

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [notice]);

  const actions =
    useMemo<PostEditActions>(
      () => ({
        beginOptimisticEdit,
        commitOptimisticEdit,
        rollbackOptimisticEdit,
        clearPostEditOverride,
        clearPostEditNotice,
      }),
      [
        beginOptimisticEdit,
        clearPostEditNotice,
        clearPostEditOverride,
        commitOptimisticEdit,
        rollbackOptimisticEdit,
      ]
    );

  return (
    <PostEditActionsContext.Provider
      value={actions}
    >
      <PostEditOverridesContext.Provider
        value={postOverrides}
      >
        <PostEditProviderNoticeContext.Provider
          value={notice}
        >
          {children}

          {notice ? (
            <div
              className={`postEditGlobalNotice ${notice.status}`}
              role={
                notice.status ===
                "error"
                  ? "alert"
                  : "status"
              }
              aria-live="polite"
              aria-atomic="true"
            >
              {notice.status ===
              "saving" ? (
                <span
                  className="postEditNoticeSpinner"
                  aria-hidden="true"
                />
              ) : notice.status ===
                "success" ? (
                <span
                  className="postEditNoticeIcon"
                  aria-hidden="true"
                >
                  ✓
                </span>
              ) : (
                <span
                  className="postEditNoticeIcon"
                  aria-hidden="true"
                >
                  !
                </span>
              )}

              <span>
                {notice.message}
              </span>
            </div>
          ) : null}
        </PostEditProviderNoticeContext.Provider>
      </PostEditOverridesContext.Provider>
    </PostEditActionsContext.Provider>
  );
};

export const usePostEditActions =
  (): PostEditActions => {
    const context = useContext(
      PostEditActionsContext
    );

    if (!context) {
      throw new Error(
        "usePostEditActions must be used inside PostEditProvider"
      );
    }

    return context;
  };

// Post.tsx will use this hook.
// It immediately returns optimistic data,
// then automatically uses the confirmed data.
export const useEditedPost = (
  sourcePost: FeedPost
): FeedPost => {
  const overrides = useContext(
    PostEditOverridesContext
  );

  const postOverride =
    overrides.get(sourcePost.id);

  if (!postOverride) {
    return sourcePost;
  }

  if (postOverride.pending) {
    return postOverride.post;
  }

  const sourceTimestamp =
    getPostTimestamp(sourcePost);

  const overrideTimestamp =
    getPostTimestamp(
      postOverride.post
    );

  // A later feed refresh must be allowed
  // to replace an older stored override.
  if (
    sourceTimestamp >
    overrideTimestamp
  ) {
    return sourcePost;
  }

  return postOverride.post;
};

export const usePostEditNotice =
  (): PostEditNotice | null => {
    return useContext(
      PostEditProviderNoticeContext
    );
  };