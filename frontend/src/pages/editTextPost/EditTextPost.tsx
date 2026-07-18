import {
  memo,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  Check,
  CircleOff,
  Grid3X3,
  Loader2,
  Palette,
  RefreshCw,
  X,
} from "lucide-react";

import type { TextPostBackground } from "../../components/textpost/textPostService";
import useEditTextPost from "./useEditTextPost";
import "./EditTextPost.css";

type BackgroundPreset = {
  id: string;
  label: string;
  background: TextPostBackground;
  textColor: string;
};

const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "none",
    label: "No background",
    background: {
      kind: "plain",
      value: "#ffffff",
    },
    textColor: "#111827",
  },
  {
    id: "pink-purple",
    label: "Pink purple",
    background: {
      kind: "gradient",
      value: "linear-gradient(135deg, #ec008c 0%, #7b2ff7 100%)",
    },
    textColor: "#ffffff",
  },
  {
    id: "blue-violet",
    label: "Blue violet",
    background: {
      kind: "gradient",
      value: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
    },
    textColor: "#ffffff",
  },
  {
    id: "sunset",
    label: "Sunset",
    background: {
      kind: "gradient",
      value: "linear-gradient(135deg, #ff512f 0%, #dd2476 100%)",
    },
    textColor: "#ffffff",
  },
  {
    id: "green",
    label: "Green",
    background: {
      kind: "solid",
      value: "#059669",
    },
    textColor: "#ffffff",
  },
  {
    id: "red",
    label: "Red",
    background: {
      kind: "solid",
      value: "#e11d48",
    },
    textColor: "#ffffff",
  },
  {
    id: "black",
    label: "Black",
    background: {
      kind: "solid",
      value: "#020617",
    },
    textColor: "#ffffff",
  },
  {
    id: "neon",
    label: "Neon",
    background: {
      kind: "gradient",
      value:
        "radial-gradient(circle at 20% 20%, #22d3ee 0%, transparent 28%), radial-gradient(circle at 80% 10%, #f472b6 0%, transparent 28%), linear-gradient(135deg, #111827 0%, #4c1d95 100%)",
    },
    textColor: "#ffffff",
  },
  {
    id: "sky",
    label: "Sky",
    background: {
      kind: "gradient",
      value: "linear-gradient(135deg, #38bdf8 0%, #0f172a 100%)",
    },
    textColor: "#ffffff",
  },
  {
    id: "soft",
    label: "Soft",
    background: {
      kind: "gradient",
      value:
        "linear-gradient(135deg, #fef3c7 0%, #fecaca 50%, #ddd6fe 100%)",
    },
    textColor: "#111827",
  },
];

const getBackgroundStyle = (
  background: TextPostBackground
): CSSProperties => {
  const value = background.value.trim();

  if (background.kind === "image" && value) {
    const safeURL = value.replace(/["\\]/g, "\\$&");

    return {
      backgroundColor: "#111827",
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.14)), url("${safeURL}")`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    };
  }

  return {
    background:
      value || (background.kind === "plain" ? "#ffffff" : "#f8fafc"),
  };
};

const EditTextPost = () => {
  const {
    post,

    text,
    background,
    textColor,
    textStyle,

    remainingCharacters,
    isLoading,
    isSaving,
    canSave,
    error,

    changeText,
    changeBackground,

    savePost,
    closeEditor,
    reloadPost,
  } = useEditTextPost();

  const [showAllBackgrounds, setShowAllBackgrounds] =
    useState(false);

  const fullName = useMemo(() => {
    return `${post?.user?.first_name ?? ""} ${
      post?.user?.last_name ?? ""
    }`.trim();
  }, [post?.user?.first_name, post?.user?.last_name]);

  const initials = useMemo(() => {
    const firstInitial = post?.user?.first_name?.charAt(0) ?? "";
    const lastInitial = post?.user?.last_name?.charAt(0) ?? "";

    return `${firstInitial}${lastInitial}`.toUpperCase() || "E";
  }, [post?.user?.first_name, post?.user?.last_name]);

  const selectedBackgroundID = useMemo(() => {
    return (
      BACKGROUND_PRESETS.find(
        (preset) =>
          preset.background.kind === background.kind &&
          preset.background.value === background.value
      )?.id ?? "custom"
    );
  }, [background]);

  const visibleBackgrounds = useMemo(() => {
    if (showAllBackgrounds) {
      return BACKGROUND_PRESETS;
    }

    return BACKGROUND_PRESETS.slice(0, 7);
  }, [showAllBackgrounds]);

  const textSizeClass = useMemo(() => {
    if (text.length > 260) {
      return "small";
    }

    if (text.length > 150) {
      return "medium";
    }

    return "large";
  }, [text.length]);

  const composerStyle = useMemo<CSSProperties>(() => {
    return getBackgroundStyle(background);
  }, [background]);

  const editorTextStyle = useMemo<CSSProperties>(() => {
    const isLeftAligned =
      textStyle === "bold_left" ||
      textStyle === "normal_left";

    const isBold =
      textStyle === "bold_center" ||
      textStyle === "bold_left";

    return {
      color: textColor,
      textAlign: isLeftAligned ? "left" : "center",
      fontWeight: isBold ? 800 : 500,
    };
  }, [textColor, textStyle]);

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }

    void savePost();
  }, [canSave, savePost]);

  const handleKeyboardShortcut = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        canSave
      ) {
        event.preventDefault();
        void savePost();
      }
    },
    [canSave, savePost]
  );

  if (isLoading && !post) {
    return (
      <main className="editTextPage">
        <section className="editTextShell">
          <header className="editTextHeader">
            <button
              type="button"
              className="editTextCloseButton"
              onClick={closeEditor}
              aria-label="Close edit text post"
            >
              <X size={24} />
            </button>

            <h1 className="editTextTitle">Edit post</h1>

            <span className="editTextHeaderSpace" />
          </header>

          <div
            className="editTextLoading"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="editTextSpin" size={30} />
            <span>Loading post...</span>
          </div>
        </section>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="editTextPage">
        <section className="editTextShell">
          <header className="editTextHeader">
            <button
              type="button"
              className="editTextCloseButton"
              onClick={closeEditor}
              aria-label="Close edit text post"
            >
              <X size={24} />
            </button>

            <h1 className="editTextTitle">Edit post</h1>

            <span className="editTextHeaderSpace" />
          </header>

          <div className="editTextFailed" role="alert">
            <p>{error || "Text post could not be loaded"}</p>

            <button
              type="button"
              className="editTextRetryButton"
              onClick={reloadPost}
            >
              <RefreshCw size={18} />
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="editTextPage">
      <section className="editTextShell">
        <header className="editTextHeader">
          <button
            type="button"
            className="editTextCloseButton"
            onClick={closeEditor}
            disabled={isSaving}
            aria-label="Close edit text post"
          >
            <X size={24} />
          </button>

          <h1 className="editTextTitle">Edit post</h1>

          <button
            type="button"
            className="editTextSaveButton"
            onClick={handleSave}
            disabled={!canSave}
            aria-disabled={!canSave}
            aria-busy={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2
                  className="editTextSpin"
                  size={17}
                  aria-hidden="true"
                />
                <span>saving</span>
              </>
            ) : (
              "save"
            )}
          </button>
        </header>

        {error ? (
          <div
            className="editTextError"
            role="alert"
            aria-live="assertive"
          >
            <span>{error}</span>

            <button
              type="button"
              onClick={() => void savePost()}
              disabled={!canSave}
            >
              Try again
            </button>
          </div>
        ) : null}

        <section className="editTextUser">
          <div className="editTextAvatar">
            {post.user?.profile_image_url ? (
              <img
                src={post.user.profile_image_url}
                alt={fullName || "Everest user"}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <strong className="editTextUserName">
            {fullName || "Everest User"}
          </strong>
        </section>

        <section
          className={`editTextComposer ${
            background.kind === "plain" ? "plain" : "designed"
          }`}
          style={composerStyle}
        >
          <textarea
            className={`editTextInput ${textSizeClass}`}
            value={text}
            style={editorTextStyle}
            onChange={(event) => changeText(event.target.value)}
            onKeyDown={handleKeyboardShortcut}
            placeholder="Write something..."
            disabled={isSaving}
            maxLength={650}
            autoFocus
            spellCheck
            aria-label="Edit text post"
          />
        </section>

        <section className="editTextTools">
          <div className="editTextToolsHeader">
            <span className="editTextToolsTitle">
              <Palette size={17} aria-hidden="true" />
              Background
            </span>

            <small
              className={`editTextCounter ${
                remainingCharacters < 60 ? "warning" : ""
              }`}
              aria-live="polite"
            >
              {remainingCharacters}
            </small>
          </div>

          <div
            className="editTextBackgroundList"
            aria-label="Post background options"
          >
            <button
              type="button"
              className="editTextToolButton"
              onClick={closeEditor}
              disabled={isSaving}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>

            {visibleBackgrounds.map((preset) => {
              const isSelected =
                selectedBackgroundID === preset.id;
              const isNoBackground = preset.id === "none";

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`editTextBackgroundButton ${
                    isNoBackground
                      ? "editTextNoBackground"
                      : ""
                  } ${isSelected ? "active" : ""}`}
                  style={
                    isNoBackground
                      ? undefined
                      : getBackgroundStyle(preset.background)
                  }
                  onClick={() =>
                    changeBackground(
                      preset.background,
                      preset.textColor
                    )
                  }
                  disabled={isSaving}
                  aria-label={preset.label}
                  aria-pressed={isSelected}
                  title={preset.label}
                >
                  {isNoBackground ? (
                    <CircleOff size={20} />
                  ) : isSelected ? (
                    <Check size={18} />
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              className={`editTextMoreButton ${
                showAllBackgrounds ? "active" : ""
              }`}
              onClick={() =>
                setShowAllBackgrounds((current) => !current)
              }
              disabled={isSaving}
              aria-label={
                showAllBackgrounds
                  ? "Show fewer backgrounds"
                  : "Show more backgrounds"
              }
              aria-expanded={showAllBackgrounds}
            >
              <Grid3X3 size={20} />
            </button>
          </div>
        </section>
      </section>
    </main>
  );
};

export default memo(EditTextPost);