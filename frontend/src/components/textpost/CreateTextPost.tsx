import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CircleOff,
  Grid3X3,
  Loader2,
  Palette,
  Smile,
  X,
} from "lucide-react";
import { getCurrentUser } from "../../services/userService";
import {
  createTextPost,
  type TextPostBackground,
} from "./textPostService";
import type { FeedPost } from "../../services/postService";
import "./CreateTextPost.css";

type CurrentUser = {
  first_name: string;
  last_name: string;
  profile_image_url?: string;
};

type BackgroundPreset = {
  id: string;
  label: string;
  background: TextPostBackground;
  textColor: string;
};

const MAX_TEXT_LENGTH = 650;

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
      value: "linear-gradient(135deg, #fef3c7 0%, #fecaca 50%, #ddd6fe 100%)",
    },
    textColor: "#111827",
  },
];

const normalizeUser = (data: Partial<CurrentUser>): CurrentUser => {
  return {
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    profile_image_url: data.profile_image_url ?? "",
  };
};

const CreateTextPost = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [text, setText] = useState("");
  const [selectedBackgroundID, setSelectedBackgroundID] =
    useState("pink-purple");
  const [posting, setPosting] = useState(false);
  const [showMoreBackgrounds, setShowMoreBackgrounds] = useState(false);

  const selectedPreset = useMemo(() => {
    return (
      BACKGROUND_PRESETS.find((preset) => preset.id === selectedBackgroundID) ??
      BACKGROUND_PRESETS[1]
    );
  }, [selectedBackgroundID]);

  const fullName = useMemo(() => {
    return `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  }, [user]);

  const firstName = fullName.split(" ")[0] || "";
  const cleanText = text.trim();
  const canPost = cleanText.length > 0 && !posting;
  const remainingChars = MAX_TEXT_LENGTH - text.length;

  const textSizeClass = useMemo(() => {
    if (text.length > 260) return "small";
    if (text.length > 150) return "medium";
    return "large";
  }, [text.length]);

  const visiblePresets = useMemo(() => {
    return showMoreBackgrounds
      ? BACKGROUND_PRESETS
      : BACKGROUND_PRESETS.slice(0, 9);
  }, [showMoreBackgrounds]);

  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setUser(normalizeUser(data));
      })
      .catch((error) => {
        console.error("Text post user load failed:", error);
      });
  }, []);

  const closePage = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleTextChange = useCallback((value: string) => {
    if (value.length > MAX_TEXT_LENGTH) {
      setText(value.slice(0, MAX_TEXT_LENGTH));
      return;
    }

    setText(value);
  }, []);

  const handlePostCreated = useCallback(
    (createdPost: FeedPost) => {
      window.dispatchEvent(
        new CustomEvent("everest:new-post", {
          detail: createdPost,
        })
      );

      navigate("/", {
        replace: true,
        state: {
          instantPost: createdPost,
        },
      });
    },
    [navigate]
  );

  const handlePost = useCallback(async () => {
    if (!canPost) return;

    try {
      setPosting(true);

      const createdPost = await createTextPost({
        text: cleanText,
        background: selectedPreset.background,
        text_color: selectedPreset.textColor,
        text_style: "bold_center",
      });

      handlePostCreated(createdPost);
    } catch (error) {
      console.error("Create text post failed:", error);
      alert("Text post create failed. Please try again.");
    } finally {
      setPosting(false);
    }
  }, [canPost, cleanText, handlePostCreated, selectedPreset]);

  return (
    <main className="createTextPage">
      <header className="createTextHeader">
        <button
          type="button"
          className="createTextClose"
          onClick={closePage}
          disabled={posting}
          aria-label="Close create text post"
        >
          <X size={24} />
        </button>

        <h1>Create post</h1>

        <button
          type="button"
          className="createTextPostBtn"
          onClick={handlePost}
          disabled={!canPost}
        >
          {posting ? (
            <>
              <Loader2 size={18} className="createTextSpin" />
              posting
            </>
          ) : (
            "post"
          )}
        </button>
      </header>

      <section className="createTextUser">
        <div className="createTextAvatar">
          {user?.profile_image_url ? (
            <img src={user.profile_image_url} alt={fullName || "Everest User"} />
          ) : (
            <span>{fullName.charAt(0) || "E"}</span>
          )}
        </div>

        <strong>{fullName || "Everest User"}</strong>
      </section>

      <section
        className={`createTextComposer ${
          selectedBackgroundID === "none" ? "plain" : "designed"
        } createTextBg-${selectedBackgroundID}`}
      >
        <textarea
          className={`createTextInput ${
            selectedBackgroundID === "none" ? "plain" : "designed"
          } ${textSizeClass}`}
          placeholder={`What's on your mind${firstName ? `, ${firstName}` : ""}?`}
          value={text}
          disabled={posting}
          autoFocus
          onChange={(event) => handleTextChange(event.target.value)}
        />
      </section>

      <section className="createTextTools">
        <div className="createTextMeta">
          <span>
            <Palette size={17} />
            Background
          </span>

          <small className={remainingChars < 60 ? "warning" : ""}>
            {remainingChars}
          </small>
        </div>

        <div className="createTextBackgrounds">
          <button
            type="button"
            className="createTextBackTool"
            onClick={closePage}
            disabled={posting}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            type="button"
            className={`createTextBgOption createTextBg-none ${
              selectedBackgroundID === "none" ? "active" : ""
            }`}
            onClick={() => setSelectedBackgroundID("none")}
            disabled={posting}
            aria-label="No background"
          >
            <CircleOff size={20} />
          </button>

          {visiblePresets
            .filter((preset) => preset.id !== "none")
            .map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`createTextBgOption createTextBg-${preset.id} ${
                  selectedBackgroundID === preset.id ? "active" : ""
                }`}
                onClick={() => setSelectedBackgroundID(preset.id)}
                disabled={posting}
                aria-label={preset.label}
              >
                {selectedBackgroundID === preset.id ? <Check size={18} /> : null}
              </button>
            ))}

          <button
            type="button"
            className="createTextBgMore"
            onClick={() => setShowMoreBackgrounds((previous) => !previous)}
            disabled={posting}
            aria-label="Show more backgrounds"
          >
            <Grid3X3 size={20} />
          </button>

          <button
            type="button"
            className="createTextEmoji"
            disabled={posting}
            aria-label="Emoji"
          >
            <Smile size={20} />
          </button>
        </div>
      </section>
    </main>
  );
};

export default memo(CreateTextPost);