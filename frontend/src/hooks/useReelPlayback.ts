import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type UseReelPlaybackOptions = {
  isActive: boolean;
  muted: boolean;
  sourceKey?: string;
};

type UseReelPlaybackResult = {
  videoRef: RefObject<HTMLVideoElement | null>;

  isPlaying: boolean;
  isBuffering: boolean;
  hasStarted: boolean;

  playbackError: string;

  play: () => Promise<void>;
  pause: () => void;
  togglePlayback: () => Promise<void>;
  restartPlayback: () => Promise<void>;
};

const getVideoErrorMessage = (
  videoElement: HTMLVideoElement
): string => {
  const mediaError =
    videoElement.error;

  if (!mediaError) {
    return "Video playback failed";
  }

  switch (mediaError.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "";

    case MediaError.MEDIA_ERR_NETWORK:
      return "Video network error";

    case MediaError.MEDIA_ERR_DECODE:
      return "Video could not be decoded";

    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Video format is not supported";

    default:
      return "Video playback failed";
  }
};

const isIgnoredPlayError = (
  error: unknown
): boolean => {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.name === "NotAllowedError"
  );
};

export const useReelPlayback = ({
  isActive,
  muted,
  sourceKey = "",
}: UseReelPlaybackOptions): UseReelPlaybackResult => {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const mountedRef =
    useRef(true);

  const activeRef =
    useRef(isActive);

  const playRequestIDRef =
    useRef(0);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [
    isBuffering,
    setIsBuffering,
  ] = useState(false);

  const [
    hasStarted,
    setHasStarted,
  ] = useState(false);

  const [
    playbackError,
    setPlaybackError,
  ] = useState("");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      playRequestIDRef.current += 1;

      const videoElement =
        videoRef.current;

      if (videoElement) {
        videoElement.pause();
      }
    };
  }, []);

  useEffect(() => {
    activeRef.current =
      isActive;
  }, [isActive]);

  const play =
    useCallback(async () => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      const requestID =
        playRequestIDRef.current +
        1;

      playRequestIDRef.current =
        requestID;

      setPlaybackError("");

      try {
        await videoElement.play();

        if (
          !mountedRef.current ||
          requestID !==
            playRequestIDRef.current
        ) {
          return;
        }

        setIsPlaying(true);
        setHasStarted(true);
      } catch (error) {
        if (
          !mountedRef.current ||
          requestID !==
            playRequestIDRef.current
        ) {
          return;
        }

        setIsPlaying(false);

        if (
          !isIgnoredPlayError(error)
        ) {
          setPlaybackError(
            error instanceof Error
              ? error.message
              : "Video playback failed"
          );
        }
      }
    }, []);

  const pause =
    useCallback(() => {
      playRequestIDRef.current += 1;

      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      videoElement.pause();

      setIsPlaying(false);
      setIsBuffering(false);
    }, []);

  const togglePlayback =
    useCallback(async () => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      if (
        videoElement.paused ||
        videoElement.ended
      ) {
        await play();
        return;
      }

      pause();
    }, [pause, play]);

  const restartPlayback =
    useCallback(async () => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      videoElement.currentTime = 0;

      if (activeRef.current) {
        await play();
      }
    }, [play]);

  useEffect(() => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    videoElement.muted = muted;
  }, [muted]);

  useEffect(() => {
    setPlaybackError("");
    setIsBuffering(false);
    setIsPlaying(false);
    setHasStarted(false);
  }, [sourceKey]);

  useEffect(() => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    if (!isActive) {
      pause();
      return;
    }

    videoElement.muted = muted;

    void play();
  }, [
    isActive,
    muted,
    pause,
    play,
    sourceKey,
  ]);

  useEffect(() => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    const handlePlay = () => {
      if (!mountedRef.current) {
        return;
      }

      setIsPlaying(true);
      setHasStarted(true);
      setPlaybackError("");
    };

    const handlePlaying = () => {
      if (!mountedRef.current) {
        return;
      }

      setIsPlaying(true);
      setIsBuffering(false);
      setHasStarted(true);
      setPlaybackError("");
    };

    const handlePause = () => {
      if (!mountedRef.current) {
        return;
      }

      setIsPlaying(false);
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      if (
        !mountedRef.current ||
        !activeRef.current
      ) {
        return;
      }

      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      if (!mountedRef.current) {
        return;
      }

      setIsBuffering(false);
      setPlaybackError("");
    };

    const handleEnded = () => {
      if (!mountedRef.current) {
        return;
      }

      setIsPlaying(false);
      setIsBuffering(false);

      if (activeRef.current) {
        videoElement.currentTime = 0;
        void play();
      }
    };

    const handleError = () => {
      if (!mountedRef.current) {
        return;
      }

      const errorMessage =
        getVideoErrorMessage(
          videoElement
        );

      setIsPlaying(false);
      setIsBuffering(false);

      if (errorMessage) {
        setPlaybackError(
          errorMessage
        );
      }
    };

    videoElement.addEventListener(
      "play",
      handlePlay
    );

    videoElement.addEventListener(
      "playing",
      handlePlaying
    );

    videoElement.addEventListener(
      "pause",
      handlePause
    );

    videoElement.addEventListener(
      "waiting",
      handleWaiting
    );

    videoElement.addEventListener(
      "canplay",
      handleCanPlay
    );

    videoElement.addEventListener(
      "ended",
      handleEnded
    );

    videoElement.addEventListener(
      "error",
      handleError
    );

    return () => {
      videoElement.removeEventListener(
        "play",
        handlePlay
      );

      videoElement.removeEventListener(
        "playing",
        handlePlaying
      );

      videoElement.removeEventListener(
        "pause",
        handlePause
      );

      videoElement.removeEventListener(
        "waiting",
        handleWaiting
      );

      videoElement.removeEventListener(
        "canplay",
        handleCanPlay
      );

      videoElement.removeEventListener(
        "ended",
        handleEnded
      );

      videoElement.removeEventListener(
        "error",
        handleError
      );
    };
  }, [play]);

  useEffect(() => {
    const handleVisibilityChange =
      () => {
        if (document.hidden) {
          pause();
          return;
        }

        if (activeRef.current) {
          void play();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [pause, play]);

  return {
    videoRef,

    isPlaying,
    isBuffering,
    hasStarted,

    playbackError,

    play,
    pause,
    togglePlayback,
    restartPlayback,
  };
};

export default useReelPlayback;