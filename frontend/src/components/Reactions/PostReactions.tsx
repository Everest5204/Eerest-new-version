import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Heart } from "lucide-react";
import type { FeedPost } from "../../services/postService";
import {
  getPostReactionSummary,
  removePostReaction,
  REACTION_META,
  setPostReaction,
  type PostReactionSummary,
  type ReactionType,
} from "../../services/reactionService";
import ReactionDetailsModal from "./ReactionDetailsModal";
import "./PostReactions.css";

type PostReactionsProps = {
  post: FeedPost;
};

type ReactionSummaryUser = {
  id?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
};

type ReactionSummaryState = PostReactionSummary & {
  first_reactor?: ReactionSummaryUser | null;
};

const REACTION_ORDER: ReactionType[] = ["love", "haha", "wow", "sad", "angry"];

const LONG_PRESS_DELAY = 430;
const SUMMARY_ICON_LIMIT = 2;

const emptySummary: ReactionSummaryState = {
  total: 0,
  counts: {},
  top_reactions: [],
  current_user_reaction: "",
  first_reactor: null,
};

const normalizeReactionType = (value: unknown): ReactionType | "" => {
  if (
    value === "love" ||
    value === "haha" ||
    value === "wow" ||
    value === "sad" ||
    value === "angry"
  ) {
    return value;
  }

  return "";
};

const getTopReactions = (
  counts: ReactionSummaryState["counts"]
): ReactionType[] => {
  return REACTION_ORDER.filter((type) => Number(counts[type] ?? 0) > 0)
    .sort((a, b) => Number(counts[b] ?? 0) - Number(counts[a] ?? 0))
    .slice(0, SUMMARY_ICON_LIMIT);
};

const normalizeSummary = (
  summary: Partial<ReactionSummaryState> | null | undefined
): ReactionSummaryState => {
  const counts = summary?.counts ?? {};

  const topReactions =
    Array.isArray(summary?.top_reactions) && summary.top_reactions.length > 0
      ? summary.top_reactions
          .map(normalizeReactionType)
          .filter(Boolean)
          .slice(0, SUMMARY_ICON_LIMIT)
      : getTopReactions(counts);

  return {
    ...emptySummary,
    ...summary,
    counts,
    top_reactions: topReactions as ReactionType[],
    current_user_reaction: normalizeReactionType(
      summary?.current_user_reaction
    ),
    first_reactor: summary?.first_reactor ?? null,
  };
};

const getReactionUserName = (summary: ReactionSummaryState) => {
  const firstReactor = summary.first_reactor;

  return `${firstReactor?.first_name ?? ""} ${
    firstReactor?.last_name ?? ""
  }`.trim();
};

const getSummaryText = (summary: ReactionSummaryState) => {
  if (summary.total <= 0) return "";

  const firstUserName = getReactionUserName(summary);

  if (!firstUserName) {
    return String(summary.total);
  }

  if (summary.total === 1) {
    return firstUserName;
  }

  return `${firstUserName} +${summary.total - 1}`;
};

const getInitialSummary = (post: FeedPost): ReactionSummaryState => {
  const rawPost = post as any;

  if (rawPost?.reaction_summary) {
    return normalizeSummary({
      ...rawPost.reaction_summary,
      first_reactor: rawPost.reaction_summary?.first_reactor ?? null,
      current_user_reaction:
        rawPost.current_user_reaction ??
        rawPost.my_reaction ??
        rawPost.reaction_summary?.current_user_reaction,
    });
  }

  return normalizeSummary({
    total: Number(post.likes_count ?? 0),
    current_user_reaction:
      rawPost?.current_user_reaction ?? rawPost?.my_reaction ?? "",
  });
};

const updateSummaryOptimistically = (
  summary: ReactionSummaryState,
  previousReaction: ReactionType | "",
  nextReaction: ReactionType | ""
): ReactionSummaryState => {
  const counts = { ...summary.counts };

  if (previousReaction) {
    const nextCount = Math.max(
      0,
      Number(counts[previousReaction] ?? 0) - 1
    );

    if (nextCount <= 0) {
      delete counts[previousReaction];
    } else {
      counts[previousReaction] = nextCount;
    }
  }

  if (nextReaction) {
    counts[nextReaction] = Number(counts[nextReaction] ?? 0) + 1;
  }

  const total = Object.values(counts).reduce(
    (sum, value) => sum + Number(value ?? 0),
    0
  );

  return normalizeSummary({
    ...summary,
    total,
    counts,
    top_reactions: getTopReactions(counts),
    current_user_reaction: nextReaction,
  });
};

const getReactionFromPoint = (
  clientX: number,
  clientY: number
): ReactionType | "" => {
  const element = document.elementFromPoint(clientX, clientY);
  const reactionElement = element?.closest<HTMLElement>(
    "[data-reaction-type]"
  );

  return normalizeReactionType(reactionElement?.dataset.reactionType);
};

const PostReactions = ({ post }: PostReactionsProps) => {
  const reactionBoxRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const historyPushedRef = useRef(false);
  const closingByBackButtonRef = useRef(false);
  const longPressOpenedRef = useRef(false);

  const [summary, setSummary] = useState<ReactionSummaryState>(() =>
    getInitialSummary(post)
  );
  const [reactionBoxOpen, setReactionBoxOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState<ReactionType | "">("");
  const [saving, setSaving] = useState(false);

  const currentReaction = summary.current_user_reaction;
  const activeMeta = currentReaction ? REACTION_META[currentReaction] : null;

  const actionLabel = activeMeta?.label ?? "Love";
  const actionEmoji = activeMeta?.emoji ?? "";
  const summaryText = getSummaryText(summary);

  const summaryReactions = useMemo(() => {
    if (summary.top_reactions.length > 0) {
      return summary.top_reactions.slice(0, SUMMARY_ICON_LIMIT);
    }

    return getTopReactions(summary.counts);
  }, [summary.counts, summary.top_reactions]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const closeReactionBox = useCallback(() => {
    setReactionBoxOpen(false);
    setHoveredReaction("");
    longPressOpenedRef.current = false;
  }, []);

  const openReactionBox = useCallback(() => {
    longPressOpenedRef.current = true;
    setReactionBoxOpen(true);
  }, []);

  const openDetailsModal = useCallback(() => {
    if (summary.total <= 0) return;

    clearLongPressTimer();
    closeReactionBox();
    setDetailsOpen(true);
  }, [clearLongPressTimer, closeReactionBox, summary.total]);

  const applyReaction = useCallback(
    async (nextReaction: ReactionType | "") => {
      if (saving || !post.id) return;

      const previousSummary = summary;
      const previousReaction = summary.current_user_reaction;

      const optimisticSummary = updateSummaryOptimistically(
        summary,
        previousReaction,
        nextReaction
      );

      setSaving(true);
      setSummary(optimisticSummary);

      try {
        const response = nextReaction
          ? await setPostReaction(post.id, nextReaction)
          : await removePostReaction(post.id);

        const nextSummary = normalizeSummary(response.summary);

        setSummary(nextSummary);

        window.dispatchEvent(
          new CustomEvent("everest:post-reaction-updated", {
            detail: {
              post_id: post.id,
              reaction_type: response.reaction_type,
              summary: nextSummary,
            },
          })
        );
      } catch (error) {
        console.error("Reaction save failed:", error);
        setSummary(previousSummary);
      } finally {
        setSaving(false);
      }
    },
    [post.id, saving, summary]
  );

  const handleQuickLove = useCallback(() => {
    if (currentReaction === "love") {
      void applyReaction("");
      return;
    }

    void applyReaction("love");
  }, [applyReaction, currentReaction]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      clearLongPressTimer();
      setHoveredReaction("");
      longPressOpenedRef.current = false;

      event.currentTarget.setPointerCapture?.(event.pointerId);

      longPressTimerRef.current = window.setTimeout(() => {
        openReactionBox();
      }, LONG_PRESS_DELAY);
    },
    [clearLongPressTimer, openReactionBox]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!reactionBoxOpen && !longPressOpenedRef.current) return;

      const reactionType = getReactionFromPoint(event.clientX, event.clientY);
      setHoveredReaction(reactionType);
    },
    [reactionBoxOpen]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      clearLongPressTimer();

      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (reactionBoxOpen || longPressOpenedRef.current) {
        const reactionType =
          getReactionFromPoint(event.clientX, event.clientY) || hoveredReaction;

        if (reactionType) {
          closeReactionBox();
          void applyReaction(reactionType);
        }

        return;
      }

      handleQuickLove();
    },
    [
      applyReaction,
      clearLongPressTimer,
      closeReactionBox,
      handleQuickLove,
      hoveredReaction,
      reactionBoxOpen,
    ]
  );

  const handlePointerCancel = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleReactionSelect = useCallback(
    (reactionType: ReactionType) => {
      closeReactionBox();
      void applyReaction(reactionType);
    },
    [applyReaction, closeReactionBox]
  );

  useEffect(() => {
    setSummary(getInitialSummary(post));
  }, [post.id]);

  useEffect(() => {
    if (!post.id) return;

    let active = true;

    getPostReactionSummary(post.id)
      .then((response) => {
        if (active) {
          setSummary(normalizeSummary(response));
        }
      })
      .catch((error) => {
        console.error("Reaction summary load failed:", error);
      });

    return () => {
      active = false;
    };
  }, [post.id]);

  useEffect(() => {
    const handleReactionUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        post_id: string;
        summary: PostReactionSummary;
      }>;

      if (customEvent.detail?.post_id !== post.id) return;

      setSummary(normalizeSummary(customEvent.detail.summary));
    };

    window.addEventListener(
      "everest:post-reaction-updated",
      handleReactionUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "everest:post-reaction-updated",
        handleReactionUpdated as EventListener
      );
    };
  }, [post.id]);

  useEffect(() => {
    if (!reactionBoxOpen) return;

    const handlePointerDownOutside = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;

      if (reactionBoxRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;

      closeReactionBox();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReactionBox();
      }
    };

    const handleScroll = () => {
      closeReactionBox();
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [closeReactionBox, reactionBoxOpen]);

  useEffect(() => {
    if (!reactionBoxOpen) return;

    closingByBackButtonRef.current = false;

    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};

    window.history.pushState(
      {
        ...currentState,
        everestReactionBoxOpen: true,
      },
      "",
      window.location.href
    );

    historyPushedRef.current = true;

    const handleBackButton = () => {
      closingByBackButtonRef.current = true;
      historyPushedRef.current = false;
      setReactionBoxOpen(false);
      setHoveredReaction("");
      longPressOpenedRef.current = false;
    };

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);

      if (historyPushedRef.current && !closingByBackButtonRef.current) {
        historyPushedRef.current = false;
        window.history.back();
      }
    };
  }, [reactionBoxOpen]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  return (
    <div className="postReactionRoot">
      {summary.total > 0 ? (
        <button
          type="button"
          className="postReactionSummary"
          aria-label={`${summaryText} reacted`}
          onClick={openDetailsModal}
        >
          <span className="postReactionSummaryIcons">
            {summaryReactions.map((reactionType) => (
              <span key={reactionType}>
                {REACTION_META[reactionType].emoji}
              </span>
            ))}
          </span>

          <span className="postReactionSummaryText">{summaryText}</span>
        </button>
      ) : null}

      {reactionBoxOpen ? (
        <div
          ref={reactionBoxRef}
          className="postReactionBox"
          role="menu"
          aria-label="Choose reaction"
        >
          {REACTION_ORDER.map((reactionType) => (
            <button
              key={reactionType}
              type="button"
              data-reaction-type={reactionType}
              className={`postReactionChoice ${reactionType} ${
                hoveredReaction === reactionType ? "selected" : ""
              }`}
              aria-label={REACTION_META[reactionType].label}
              onClick={() => handleReactionSelect(reactionType)}
              onPointerEnter={() => setHoveredReaction(reactionType)}
              onPointerLeave={() => setHoveredReaction("")}
            >
              <span>{REACTION_META[reactionType].emoji}</span>
              <strong>{REACTION_META[reactionType].label}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        className={`postReactionButton ${currentReaction ? "active" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        disabled={saving}
      >
        {currentReaction ? (
          <span className={`postReactionButtonEmoji ${currentReaction}`}>
            {actionEmoji}
          </span>
        ) : (
          <Heart size={22} strokeWidth={1.9} />
        )}

        <span>{actionLabel}</span>
      </button>

      <ReactionDetailsModal
        postId={post.id}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
};

export default memo(PostReactions);