import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  MoreHorizontal,
  Pencil,
} from "lucide-react";

import type {
  FeedPost,
  MediaItem,
} from "../../services/postService";

import {
  getCurrentUser,
} from "../../services/userService";

import DeletePostAction from "../DeletePost/DeletePostAction";

import CopyPostLinkAction from "../../features/post-actions/copy-link/CopyPostLinkAction";
import DownloadPostAction from "../../features/post-actions/download-post/DownloadPostAction";
import HidePostAction from "../../features/post-actions/hide-post/HidePostAction";
import PinPostAction from "../../features/post-actions/pin-post/PinPostAction";
import ReportPostAction from "../../features/post-actions/report-post/ReportPostAction";
import SavePostAction from "../../features/post-actions/save-post/SavePostAction";

import PostActionButton from "../../features/post-actions/shared/PostActionButton";
import PostActionToast from "../../features/post-actions/shared/PostActionToast";

import type {
  PostActionToastTone,
} from "../../features/post-actions/shared/PostActionToast";

import "./PostOptionsMenu.css";

type PostOptionsMenuProps = {
  post: FeedPost;
  mediaItems: MediaItem[];
  caption: string;
  textPostContent: string;
};

type ToastState = {
  id: number;
  open: boolean;
  message: string;
  tone: PostActionToastTone;
};

const normalizeEntityID = (
  value: unknown
): string => {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const objectValue =
      value as Record<
        string,
        unknown
      >;

    if (
      typeof objectValue.$oid ===
      "string"
    ) {
      return objectValue.$oid;
    }

    if (
      typeof objectValue.hex ===
      "string"
    ) {
      return objectValue.hex;
    }
  }

  return String(value);
};

let cachedCurrentUserID = "";

let currentUserIDRequest:
  | Promise<string>
  | null = null;

const getCachedCurrentUserID =
  async (): Promise<string> => {
    if (cachedCurrentUserID) {
      return cachedCurrentUserID;
    }

    if (!currentUserIDRequest) {
      currentUserIDRequest =
        getCurrentUser()
          .then((user: any) =>
            normalizeEntityID(
              user?.id ??
                user?._id
            )
          )
          .catch(() => "");
    }

    cachedCurrentUserID =
      await currentUserIDRequest;

    return cachedCurrentUserID;
  };

const PostOptionsMenu = ({
  post,
  mediaItems,
  caption,
  textPostContent,
}: PostOptionsMenuProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const menuButtonRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const historyPushedRef =
    useRef(false);

  const closingByBackButtonRef =
    useRef(false);

  const deleteModalOpenRef =
    useRef(false);

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const [
    deleteModalOpen,
    setDeleteModalOpen,
  ] = useState(false);

  const [
    currentUserID,
    setCurrentUserID,
  ] = useState("");

  const [
    toast,
    setToast,
  ] = useState<ToastState>({
    id: 0,
    open: false,
    message: "",
    tone: "info",
  });

  const postID =
    normalizeEntityID(post.id);

  const postOwnerID =
    normalizeEntityID(
      post.user_id ||
        post.user?.id
    );

  const isOwnPost = Boolean(
    currentUserID &&
      postOwnerID &&
      currentUserID ===
        postOwnerID
  );

  const normalizedPostType =
    String(post.type ?? "")
      .trim()
      .toLowerCase();

  const isEditableTextPost =
    normalizedPostType === "text" ||
    (
      mediaItems.length === 0 &&
      Boolean(
        textPostContent.trim()
      )
    );

  const isEditableMediaPost =
    mediaItems.length > 0 &&
    (
      normalizedPostType ===
        "image" ||
      normalizedPostType ===
        "video"
    );

  const isEditablePost =
    isEditableTextPost ||
    isEditableMediaPost;

  const notify = useCallback(
    (
      message: string,
      tone:
        PostActionToastTone =
          "info"
    ) => {
      setToast((previous) => ({
        id: previous.id + 1,
        open: true,
        message,
        tone,
      }));
    },
    []
  );

  const closeToast =
    useCallback(() => {
      setToast((previous) => ({
        ...previous,
        open: false,
      }));
    }, []);

  const handleDeleteModalOpenChange =
    useCallback(
      (open: boolean) => {
        deleteModalOpenRef.current =
          open;

        setDeleteModalOpen(open);

        if (!open) {
          setMenuOpen(false);
        }
      },
      []
    );

  const closeMenu =
    useCallback(() => {
      if (
        deleteModalOpenRef.current
      ) {
        return;
      }

      setMenuOpen(false);
    }, []);

  const toggleMenu =
    useCallback(() => {
      if (
        deleteModalOpenRef.current
      ) {
        return;
      }

      setMenuOpen(
        (previous) => !previous
      );
    }, []);

  const handleEditPost =
    useCallback(() => {
      if (!postID) {
        return;
      }

      historyPushedRef.current =
        false;

      closingByBackButtonRef.current =
        true;

      setMenuOpen(false);

      const editRoute =
        isEditableTextPost
          ? `/text-posts/${encodeURIComponent(
              postID
            )}/edit`
          : `/posts/${encodeURIComponent(
              postID
            )}/edit`;

      const postForEditor =
        isEditableTextPost
          ? {
              ...post,
              type: "text",
              text:
                textPostContent ||
                post.text ||
                caption,
              caption:
                textPostContent ||
                post.text ||
                caption,
            }
          : post;

      navigate(editRoute, {
        replace: true,

        state: {
          post: postForEditor,

          returnTo:
            `${location.pathname}${location.search}`,
        },
      });
    }, [
      caption,
      isEditableTextPost,
      location.pathname,
      location.search,
      navigate,
      post,
      postID,
      textPostContent,
    ]);

  useEffect(() => {
    let active = true;

    getCachedCurrentUserID().then(
      (userID) => {
        if (active) {
          setCurrentUserID(
            userID
          );
        }
      }
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (
      event: PointerEvent
    ) => {
      if (
        deleteModalOpenRef.current
      ) {
        return;
      }

      const target =
        event.target as Node;

      if (
        menuRef.current?.contains(
          target
        )
      ) {
        return;
      }

      if (
        menuButtonRef.current
          ?.contains(target)
      ) {
        return;
      }

      closeMenu();
    };

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        deleteModalOpenRef.current
      ) {
        return;
      }

      if (
        event.key === "Escape"
      ) {
        closeMenu();
      }
    };

    document.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    closeMenu,
    menuOpen,
  ]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow =
      document.body.style.overflow;

    if (
      window.innerWidth <= 640
    ) {
      document.body.style.overflow =
        "hidden";
    }

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    closingByBackButtonRef.current =
      false;

    const currentState =
      window.history.state &&
      typeof window.history.state ===
        "object"
        ? window.history.state
        : {};

    window.history.pushState(
      {
        ...currentState,
        everestPostOptionsMenuOpen:
          true,
      },
      "",
      window.location.href
    );

    historyPushedRef.current =
      true;

    const handleBackButton = (
      event: PopStateEvent
    ) => {
      if (
        deleteModalOpenRef.current
      ) {
        return;
      }

      const nextState =
        event.state &&
        typeof event.state ===
          "object"
          ? event.state
          : {};

      if (
        nextState
          .everestPostOptionsMenuOpen ===
        true
      ) {
        return;
      }

      closingByBackButtonRef.current =
        true;

      historyPushedRef.current =
        false;

      setMenuOpen(false);
    };

    window.addEventListener(
      "popstate",
      handleBackButton
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handleBackButton
      );

      if (
        historyPushedRef.current &&
        !closingByBackButtonRef.current
      ) {
        historyPushedRef.current =
          false;

        window.history.back();
      }
    };
  }, [menuOpen]);

  return (
    <>
      <div className="postOptionsRoot">
        <button
          ref={menuButtonRef}
          type="button"
          className={`postMoreBtn ${
            menuOpen ? "active" : ""
          }`}
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          <MoreHorizontal
            size={22}
          />
        </button>

        {menuOpen ? (
          <>
            {!deleteModalOpen ? (
              <button
                type="button"
                className="postMenuBackdrop"
                aria-label="Close post menu"
                onClick={closeMenu}
              />
            ) : null}

            <div
              ref={menuRef}
              className="postOptionsMenu"
              role="menu"
              aria-label="Post options"
              aria-hidden={
                deleteModalOpen
              }
              style={{
                visibility:
                  deleteModalOpen
                    ? "hidden"
                    : "visible",

                pointerEvents:
                  deleteModalOpen
                    ? "none"
                    : "auto",
              }}
            >
              {isOwnPost ? (
                <DeletePostAction
                  postID={postID}
                  onDeleteModalOpenChange={
                    handleDeleteModalOpenChange
                  }
                />
              ) : null}

              {isOwnPost &&
              isEditablePost ? (
                <PostActionButton
                  icon={
                    <Pencil
                      size={20}
                      strokeWidth={2.3}
                    />
                  }
                  label="Edit post"
                  onClick={
                    handleEditPost
                  }
                />
              ) : null}

              {isOwnPost ? (
                <PinPostAction
                  postID={postID}
                  onCloseMenu={
                    closeMenu
                  }
                  onNotify={notify}
                />
              ) : null}

              <SavePostAction
                postID={postID}
                onCloseMenu={
                  closeMenu
                }
                onNotify={notify}
              />

              <CopyPostLinkAction
                postID={postID}
                onCloseMenu={
                  closeMenu
                }
                onNotify={notify}
              />

              <DownloadPostAction
                postID={postID}
                mediaItems={
                  mediaItems
                }
                caption={caption}
                textPostContent={
                  textPostContent
                }
                onCloseMenu={
                  closeMenu
                }
                onNotify={notify}
              />

              <HidePostAction
                postID={postID}
                onCloseMenu={
                  closeMenu
                }
                onNotify={notify}
              />

              <ReportPostAction
                postID={postID}
                onCloseMenu={
                  closeMenu
                }
                onNotify={notify}
              />
            </div>
          </>
        ) : null}
      </div>

      <PostActionToast
        key={toast.id}
        open={toast.open}
        message={toast.message}
        tone={toast.tone}
        onClose={closeToast}
      />
    </>
  );
};

export default PostOptionsMenu;