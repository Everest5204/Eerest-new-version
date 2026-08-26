import {
  memo,
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
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

const createCloudinaryPosterUrl = (
  videoUrl: string,
): string => {
  const cleanUrl = videoUrl.trim();
  const marker = "/video/upload/";
  const markerIndex = cleanUrl.indexOf(marker);

  if (markerIndex < 0) {
    return "";
  }

  const prefixEnd = markerIndex + marker.length;
  const prefix = cleanUrl.slice(0, prefixEnd);
  const assetPath = cleanUrl
    .slice(prefixEnd)
    .split("?", 1)[0];

  const lastSlashIndex = assetPath.lastIndexOf("/");
  const lastDotIndex = assetPath.lastIndexOf(".");

  if (lastDotIndex <= lastSlashIndex) {
    return "";
  }

  return `${prefix}so_auto,c_fill,g_auto,w_480,h_854,f_auto,q_auto/${assetPath.slice(
    0,
    lastDotIndex,
  )}.jpg`;
};

const isNearlyBlackPoster = (
  image: HTMLImageElement,
): boolean => {
  try {
    const canvas = document.createElement("canvas");
    const width = 18;
    const height = 32;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      return false;
    }

    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(
      0,
      0,
      width,
      height,
    ).data;

    let visiblePixels = 0;
    let darkPixels = 0;
    let totalLuminance = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];

      if (alpha < 24) {
        continue;
      }

      const luminance =
        pixels[index] * 0.2126 +
        pixels[index + 1] * 0.7152 +
        pixels[index + 2] * 0.0722;

      visiblePixels += 1;
      totalLuminance += luminance;

      if (luminance < 30) {
        darkPixels += 1;
      }
    }

    if (visiblePixels === 0) {
      return true;
    }

    const averageLuminance =
      totalLuminance / visiblePixels;
    const darkPixelRatio =
      darkPixels / visiblePixels;

    return (
      averageLuminance < 24 &&
      darkPixelRatio > 0.86
    );
  } catch {
    // If browser security prevents pixel inspection, use the valid poster.
    return false;
  }
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
      posterLoaded,
      setPosterLoaded,
    ] = useState(false);

    const reelRecord =
      toRecord(reel);

    const userRecord =
      toRecord(reelRecord.user);

    const media =
      getPrimaryReelMedia(reel);

    const videoUrl =
      media?.url?.trim() || "";

    // Build the optimized poster on the client as well, so previews remain
    // correct even while an older backend response still contains `so_0`.
    const posterUrl =
      createCloudinaryPosterUrl(videoUrl) ||
      media?.poster_url?.trim() ||
      "";

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
      setPosterLoaded(false);
    }, [
      reel.id,
      posterUrl,
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

    const handlePosterLoad = useCallback(
      (
        event: SyntheticEvent<HTMLImageElement>,
      ) => {
        setPosterLoaded(
          !isNearlyBlackPoster(event.currentTarget),
        );
      },
      [],
    );

    const mediaReady =
      showPoster && posterLoaded;

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
          <span
            className={`reel-preview-card__placeholder ${
              mediaReady ? "is-hidden" : ""
            }`}
            aria-hidden="true"
          >
            <span className="reel-preview-card__placeholder-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
              >
                <rect
                  x="4"
                  y="4.5"
                  width="16"
                  height="15"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />

                <path
                  d="M4.5 9h15M8 4.8 11.2 9M14 4.8 17.2 9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />

                <path
                  d="m10.5 12 4.2 2.5-4.2 2.5v-5Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </span>

          {showPoster ? (
            <img
              className={`reel-preview-card__poster ${
                posterLoaded ? "is-ready" : ""
              }`}
              src={posterUrl}
              alt=""
              loading={
                priority
                  ? "eager"
                  : "lazy"
              }
              decoding="async"
              draggable={false}
              crossOrigin={
                posterUrl.includes("cloudinary.com")
                  ? "anonymous"
                  : undefined
              }
              onLoad={handlePosterLoad}
              onError={() => {
                setPosterLoaded(false);
                setPosterFailed(true);
              }}
            />
          ) : (
            null
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
