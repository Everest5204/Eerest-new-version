import { memo } from "react";

export type ReelHeartAnimationProps = {
  animationKey: number;
  className?: string;
};

const PARTICLE_IDS = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
] as const;

const ReelHeartAnimation = memo(
  ({
    animationKey,
    className = "",
  }: ReelHeartAnimationProps) => {
    if (animationKey <= 0) {
      return null;
    }

    const rootClassName = [
      "reel-heart-animation",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    /*
     * animationKey পরিবর্তিত হলে element remount হবে।
     * ফলে প্রতিটি double-tap-এ CSS animation আবার চলবে।
     */
    return (
      <div
        key={animationKey}
        className={rootClassName}
        aria-hidden="true"
      >
        <span className="reel-heart-animation__glow" />

        {PARTICLE_IDS.map((particleID) => (
          <span
            key={particleID}
            className={[
              "reel-heart-animation__particle",
              `reel-heart-animation__particle--${particleID}`,
            ].join(" ")}
          />
        ))}

        <svg
          className="reel-heart-animation__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          focusable="false"
        >
          <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
        </svg>
      </div>
    );
  },
);

ReelHeartAnimation.displayName =
  "ReelHeartAnimation";

export default ReelHeartAnimation;