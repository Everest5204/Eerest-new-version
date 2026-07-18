import {
  memo,
  useCallback,
} from "react";

import "./ReelActions.css";

type ReelActionHandler = (
) => void | Promise<void>;

export type ReelActionsProps = {
  isLoved: boolean;
  likesCount: number;
  commentsCount: number;

  lovePending?: boolean;
  className?: string;

  onLove: ReelActionHandler;
  onComment: ReelActionHandler;
  onShare: ReelActionHandler;
};

const compactNumberFormatter =
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

const normalizeCount = (
  count: number,
): number => {
  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.max(0, Math.floor(count));
};

const formatCount = (count: number): string => {
  return compactNumberFormatter.format(
    normalizeCount(count),
  );
};

const runAction = (
  action: ReelActionHandler,
): void => {
  void Promise.resolve(action()).catch(
    () => undefined,
  );
};

const ReelActions = memo(
  ({
    isLoved,
    likesCount,
    commentsCount,
    lovePending = false,
    className = "",
    onLove,
    onComment,
    onShare,
  }: ReelActionsProps) => {
    const handleLove = useCallback(() => {
      runAction(onLove);
    }, [onLove]);

    const handleComment = useCallback(() => {
      runAction(onComment);
    }, [onComment]);

    const handleShare = useCallback(() => {
      runAction(onShare);
    }, [onShare]);

    const normalizedLikesCount =
      normalizeCount(likesCount);

    const normalizedCommentsCount =
      normalizeCount(commentsCount);

    const rootClassName = [
      "reel-actions",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={rootClassName}
        role="group"
        aria-label="Reel actions"
      >
        <div className="reel-actions__item">
          <button
            type="button"
            className={[
              "reel-actions__button",
              "reel-actions__love-button",
              isLoved
                ? "reel-actions__love-button--active"
                : "",
              lovePending
                ? "reel-actions__button--pending"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-reel-control="true"
            disabled={lovePending}
            aria-pressed={isLoved}
            aria-busy={lovePending}
            aria-label={
              isLoved
                ? `Remove love. ${normalizedLikesCount} loves`
                : `Love reel. ${normalizedLikesCount} loves`
            }
            onClick={handleLove}
          >
            <svg
              viewBox="0 0 24 24"
              fill={
                isLoved
                  ? "currentColor"
                  : "none"
              }
              aria-hidden="true"
            >
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <span
            className="reel-actions__count"
            aria-hidden="true"
          >
            {formatCount(normalizedLikesCount)}
          </span>
        </div>

        <div className="reel-actions__item">
          <button
            type="button"
            className="reel-actions__button"
            data-reel-control="true"
            aria-label={`Open comments. ${normalizedCommentsCount} comments`}
            onClick={handleComment}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <span
            className="reel-actions__count"
            aria-hidden="true"
          >
            {formatCount(
              normalizedCommentsCount,
            )}
          </span>
        </div>

        <div className="reel-actions__item">
          <button
            type="button"
            className="reel-actions__button"
            data-reel-control="true"
            aria-label="Share reel"
            onClick={handleShare}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M22 2 11 13"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />

              <path
                d="m22 2-7 20-4-9-9-4 20-7Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <span
            className="reel-actions__label"
            aria-hidden="true"
          >
            Share
          </span>
        </div>
      </div>
    );
  },
);

ReelActions.displayName = "ReelActions";

export default ReelActions;