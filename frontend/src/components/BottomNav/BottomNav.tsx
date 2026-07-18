import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
} from "react";

import {
  Home,
  Plus,
  Users,
  User,
  Edit3,
  Image,
  Film,
  CirclePlus,
  Zap,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import useBackDismiss from "../../hooks/useBackDismiss";

import "./BottomNav.css";

const MAX_MEDIA_IMAGES = 10;

type CreateMenuType =
  | "text"
  | "media"
  | "reels"
  | "story"
  | "ai";

type ReelsIconProps = {
  size?: number;
};

const ReelsIcon = ({
  size = 27,
}: ReelsIconProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="4.2"
        stroke="currentColor"
        strokeWidth="1.9"
      />

      <path
        d="M3.8 9h16.4M7.1 4.8 9.9 9M13.2 4.8 16 9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M10 11.25v5.5L15 14l-5-2.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const BottomNav = () => {
  const navigate = useNavigate();

  const [
    openCreateMenu,
    setOpenCreateMenu,
  ] = useState(false);

  const dropdownRef =
    useRef<HTMLDivElement | null>(null);

  const createButtonRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const mediaInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const reelInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const closeCreateMenu =
    useCallback(() => {
      setOpenCreateMenu(false);
    }, []);

  const toggleCreateMenu =
    useCallback(() => {
      setOpenCreateMenu(
        (previousValue) =>
          !previousValue,
      );
    }, []);

  /*
   * Mobile physical/browser Back button চাপলে
   * আগে Create menu বন্ধ হবে।
   */
  useBackDismiss({
    isOpen: openCreateMenu,
    onDismiss: closeCreateMenu,
    stateKey: "bottom-create-menu",
  });

  const handleHomeClick =
    useCallback(() => {
      navigate("/");
    }, [navigate]);

  const handleReelsClick =
    useCallback(() => {
      navigate("/reels");
    }, [navigate]);

  const handleProfileClick =
    useCallback(() => {
      const token =
        sessionStorage.getItem("token");

      if (!token) {
        alert(
          "Please signup to your account",
        );

        return;
      }

      navigate("/profile");
    }, [navigate]);

  const openMediaPicker =
    useCallback(() => {
      closeCreateMenu();

      mediaInputRef.current?.click();
    }, [closeCreateMenu]);

  const openReelPicker =
    useCallback(() => {
      closeCreateMenu();

      reelInputRef.current?.click();
    }, [closeCreateMenu]);

  const handleMediaSelect =
    useCallback(
      (
        event: ChangeEvent<HTMLInputElement>,
      ) => {
        const selectedFiles =
          Array.from(
            event.target.files ?? [],
          );

        event.target.value = "";

        if (
          selectedFiles.length === 0
        ) {
          return;
        }

        const firstFile =
          selectedFiles[0];

        /*
         * Media picker থেকে video select হলেও সেটি
         * existing upload page দিয়ে Reel হবে।
         */
        if (
          firstFile.type.startsWith(
            "video/",
          )
        ) {
          navigate("/create/media", {
            state: {
              files: [firstFile],
            },
          });

          return;
        }

        if (
          firstFile.type.startsWith(
            "image/",
          )
        ) {
          const imageFiles =
            selectedFiles
              .filter((file) =>
                file.type.startsWith(
                  "image/",
                ),
              )
              .slice(
                0,
                MAX_MEDIA_IMAGES,
              );

          navigate("/create/media", {
            state: {
              files: imageFiles,
            },
          });
        }
      },
      [navigate],
    );

  const handleReelSelect =
    useCallback(
      (
        event: ChangeEvent<HTMLInputElement>,
      ) => {
        const selectedFiles =
          Array.from(
            event.target.files ?? [],
          );

        event.target.value = "";

        const selectedVideo =
          selectedFiles.find((file) =>
            file.type.startsWith(
              "video/",
            ),
          );

        if (!selectedVideo) {
          return;
        }

        /*
         * আলাদা Reel upload backend প্রয়োজন নেই।
         * Existing video post create API type=video
         * save করবে, Reels API সেটিই read করবে।
         */
        navigate("/create/media", {
          state: {
            files: [selectedVideo],
          },
        });
      },
      [navigate],
    );

  const handleCreateMenuClick =
    useCallback(
      (type: CreateMenuType) => {
        if (type === "media") {
          openMediaPicker();
          return;
        }

        if (type === "reels") {
          openReelPicker();
          return;
        }

        closeCreateMenu();

        const routes: Record<
          Exclude<
            CreateMenuType,
            "media" | "reels"
          >,
          string
        > = {
          text: "/create/text",
          story: "/story/create",
          ai: "/ai",
        };

        navigate(routes[type]);
      },
      [
        closeCreateMenu,
        navigate,
        openMediaPicker,
        openReelPicker,
      ],
    );

  useEffect(() => {
    if (!openCreateMenu) {
      return;
    }

    const handleOutsideClick = (
      event: MouseEvent | TouchEvent,
    ) => {
      const target =
        event.target as Node;

      if (
        dropdownRef.current?.contains(
          target,
        ) ||
        createButtonRef.current?.contains(
          target,
        )
      ) {
        return;
      }

      closeCreateMenu();
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    document.addEventListener(
      "touchstart",
      handleOutsideClick,
      {
        passive: true,
      },
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );

      document.removeEventListener(
        "touchstart",
        handleOutsideClick,
      );
    };
  }, [
    closeCreateMenu,
    openCreateMenu,
  ]);

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary navigation"
    >
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={handleMediaSelect}
      />

      <input
        ref={reelInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={handleReelSelect}
      />

      {openCreateMenu && (
        <div
          ref={dropdownRef}
          className="create-dropdown"
          role="menu"
          aria-label="Create"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleCreateMenuClick(
                "text",
              )
            }
          >
            <Edit3 size={20} />
            <span>Text post</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleCreateMenuClick(
                "media",
              )
            }
          >
            <Image size={20} />
            <span>Media post</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleCreateMenuClick(
                "reels",
              )
            }
          >
            <Film size={20} />
            <span>Reels</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleCreateMenuClick(
                "story",
              )
            }
          >
            <CirclePlus size={20} />
            <span>Story</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() =>
              handleCreateMenuClick(
                "ai",
              )
            }
          >
            <Zap size={20} />
            <span>AI</span>
          </button>
        </div>
      )}

      <button
        className="bottom-nav-item active"
        type="button"
        aria-label="Home"
        onClick={handleHomeClick}
      >
        <Home size={27} />
      </button>

      <button
        className="bottom-nav-item"
        type="button"
        aria-label="Reels"
        onClick={handleReelsClick}
      >
        <ReelsIcon size={27} />
      </button>

      <button
        ref={createButtonRef}
        className={[
          "bottom-nav-create",
          openCreateMenu
            ? "active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        aria-label={
          openCreateMenu
            ? "Close create menu"
            : "Open create menu"
        }
        aria-expanded={
          openCreateMenu
        }
        onClick={toggleCreateMenu}
      >
        <Plus size={30} />
      </button>

      <button
        className="bottom-nav-item"
        type="button"
        aria-label="Friends"
      >
        <Users size={27} />
      </button>

      <button
        className="bottom-nav-item"
        type="button"
        aria-label="Profile"
        onClick={handleProfileClick}
      >
        <User size={27} />
      </button>
    </nav>
  );
};

export default BottomNav;