import {
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getPrimaryReelMedia,
} from "../../services/reelsService";

import type {
  Reel,
} from "../../services/reelsService";

import "./ReelsPreviewSection.css";

type UnknownRecord =
  Record<string, unknown>;

type OpenReelHandler = (
  reel: Reel,
) => void | Promise<void>;

export type ReelPreviewCardProps = {
  reel: Reel;
  priority?: boolean;
  className?: string;
  onOpen: OpenReelHandler;
};

const compactNumberFormatter =
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

const toRecord = (
  value: unknown,
): UnknownRecord => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  return {};
};

const getStringValue = (
  record: UnknownRecord,
  keys: readonly string[],
): string => {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
};

const getNumberValue = (
  record: UnknownRecord,
  keys: readonly string[],
): number => {
  for (const key of keys) {
    const numberValue =
      Number(record[key]);

    if (Number.isFinite(numberValue)) {
      return Math.max(
        0,
        Math.floor(numberValue),
      );
    }
  }

  return 0;
};

const ReelPreviewCard = memo(
  ({
    reel,
    priority = false,
    className = "",
    onOpen,
  }: ReelPreviewCardProps) => {
    const [
      posterFailed,
      setPosterFailed,
    ] = useState(false);

    const [
      videoFailed,
      setVideoFailed,
    ] = useState(false);

    const reelRecord =
      toRecord(reel);

    const userRecord =
      toRecord(reelRecord.user);

    const media =
      getPrimaryReelMedia(reel);

    const posterUrl =
      media?.poster_url?.trim() || "";

    const videoUrl =
      media?.url?.trim() || "";

    const firstName =
      getStringValue(userRecord, [
        "first_name",
        "firstName",
      ]);

    const lastName =
      getStringValue(userRecord, [
        "last_name",
        "lastName",
      ]);

    const displayName =
      getStringValue(userRecord, [
        "display_name",
        "displayName",
        "full_name",
        "fullName",
        "name",
      ]) ||
      [firstName, lastName]
        .filter(Boolean)
        .join(" ") ||
      getStringValue(userRecord, [
        "username",
      ]) ||
      "Everest User";

    const likesCount =
      getNumberValue(reelRecord, [
        "likes_count",
        "reactions_count",
      ]);

    useEffect(() => {
      setPosterFailed(false);
      setVideoFailed(false);
    }, [
      reel.id,
      posterUrl,
      videoUrl,
    ]);

    const handleOpen =
      useCallback(() => {
        void Promise.resolve(
          onOpen(reel),
        ).catch(() => undefined);
      }, [onOpen, reel]);

    const showPoster =
      Boolean(posterUrl) &&
      !posterFailed;

    const showVideoFallback =
      !showPoster &&
      Boolean(videoUrl) &&
      !videoFailed;

    const rootClassName = [
      "reel-preview-card",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        className={rootClassName}
        data-reel-preview-id={reel.id}
        aria-label={`Open reel by ${displayName}`}
        onClick={handleOpen}
      >
        <span className="reel-preview-card__media">
          {showPoster ? (
            <img
              className="reel-preview-card__poster"
              src={posterUrl}
              alt=""
              loading={
                priority
                  ? "eager"
                  : "lazy"
              }
              decoding="async"
              draggable={false}
              onError={() => {
                setPosterFailed(true);
              }}
            />
          ) : showVideoFallback ? (
            <video
              className="reel-preview-card__poster"
              src={videoUrl}
              muted
              playsInline
              controls={false}
              preload="metadata"
              tabIndex={-1}
              aria-hidden="true"
              disablePictureInPicture
              onError={() => {
                setVideoFailed(true);
              }}
            />
          ) : (
            <span className="reel-preview-card__unavailable">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 3 21 21M10.6 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12M15 6h3a2 2 0 0 1 2 2v8c0 .4-.1.8-.3 1.1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          )}

          <span
            className="reel-preview-card__gradient"
            aria-hidden="true"
          />

          <span className="reel-preview-card__footer">
            <span
              className="reel-preview-card__likes"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
              </svg>

              {compactNumberFormatter.format(
                likesCount,
              )}
            </span>
          </span>
        </span>
      </button>
    );
  },
);

ReelPreviewCard.displayName =
  "ReelPreviewCard";

export default ReelPreviewCard;