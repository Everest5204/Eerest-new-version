import { memo, useEffect, useMemo, useState } from "react";
import { User, X } from "lucide-react";
import {
  getPostReactionUsers,
  REACTION_META,
  type ReactionType,
  type ReactionUserItem,
} from "../../services/reactionService";
import "./ReactionDetailsModal.css";

type ReactionDetailsModalProps = {
  postId: string;
  open: boolean;
  onClose: () => void;
};

const REACTION_TABS: Array<ReactionType | "all"> = [
  "all",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
];

const getFullName = (item: ReactionUserItem) => {
  return `${item.user.first_name ?? ""} ${item.user.last_name ?? ""}`.trim();
};

const ReactionDetailsModal = ({
  postId,
  open,
  onClose,
}: ReactionDetailsModalProps) => {
  const [activeTab, setActiveTab] = useState<ReactionType | "all">("all");
  const [items, setItems] = useState<ReactionUserItem[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReactionType, number>>>(
    {}
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const visibleTabs = useMemo(() => {
    return REACTION_TABS.filter((tab) => {
      if (tab === "all") return total > 0;
      return Number(counts[tab] ?? 0) > 0;
    });
  }, [counts, total]);

  useEffect(() => {
    if (!open || !postId) return;

    let active = true;

    setLoading(true);

    getPostReactionUsers(postId, activeTab)
      .then((response) => {
        if (!active) return;

        setItems(response.items ?? []);
        setCounts(response.counts ?? {});
        setTotal(Number(response.total ?? 0));
      })
      .catch((error) => {
        console.error("Reaction users load failed:", error);

        if (active) {
          setItems([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, open, postId]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="reactionDetailsOverlay" role="dialog" aria-modal="true">
      <div className="reactionDetailsPanel">
        <header className="reactionDetailsHeader">
          <h2>Reactions</h2>

          <button
            type="button"
            className="reactionDetailsClose"
            onClick={onClose}
            aria-label="Close reactions"
          >
            <X size={24} />
          </button>
        </header>

        <nav className="reactionDetailsTabs" aria-label="Reaction filters">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                className={`reactionDetailsTab ${active ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "all" ? (
                  <>
                    <span>All</span>
                    <strong>{total}</strong>
                  </>
                ) : (
                  <>
                    <span>{REACTION_META[tab].emoji}</span>
                    <strong>{Number(counts[tab] ?? 0)}</strong>
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className="reactionDetailsBody">
          {loading ? (
            <div className="reactionDetailsState">Loading reactions...</div>
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="reactionDetailsState">No reactions found.</div>
          ) : null}

          {!loading &&
            items.map((item) => {
              const fullName = getFullName(item) || "Everest User";
              const profileImageURL = item.user.profile_image_url?.trim() || "";

              return (
                <article key={item.id} className="reactionDetailsUser">
                  <div className="reactionDetailsAvatar">
                    {profileImageURL ? (
                      <img src={profileImageURL} alt={fullName} />
                    ) : (
                      <User size={22} strokeWidth={1.8} />
                    )}

                    <span className="reactionDetailsUserEmoji">
                      {REACTION_META[item.reaction_type].emoji}
                    </span>
                  </div>

                 <div className="reactionDetailsUserInfo">
                 <strong>{fullName}</strong>
                </div>
                </article>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default memo(ReactionDetailsModal);