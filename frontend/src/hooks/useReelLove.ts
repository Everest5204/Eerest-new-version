import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  removePostReaction,
  setPostReaction,
} from "../services/reactionService";

import type { Reel } from "../services/reelsService";

export type ReelLoveState = {
  isLoved: boolean;
  likesCount: number;
  currentUserReaction: string;
};

type UseReelLoveOptions = {
  reel: Reel;
  onChange?: (state: ReelLoveState) => void;
};

const normalizeReaction = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const normalizeLikesCount = (
  value: unknown,
  fallback = 0,
): number => {
  const count = Number(value);

  if (!Number.isFinite(count)) {
    return Math.max(0, fallback);
  }

  return Math.max(0, Math.floor(count));
};

const createInitialState = (
  reel: Reel,
): ReelLoveState => {
  const currentUserReaction = normalizeReaction(
    reel.current_user_reaction,
  );

  return {
    isLoved:
      Boolean(reel.is_loved_by_me) ||
      currentUserReaction === "love",
    likesCount: normalizeLikesCount(reel.likes_count),
    currentUserReaction,
  };
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Love update করা যায়নি। আবার চেষ্টা করুন।";
};

export const useReelLove = ({
  reel,
  onChange,
}: UseReelLoveOptions) => {
  const [loveState, setLoveState] =
    useState<ReelLoveState>(() =>
      createInitialState(reel),
    );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );

  const [
    heartAnimationKey,
    setHeartAnimationKey,
  ] = useState(0);

  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const requestIDRef = useRef(0);
  const reelIDRef = useRef(reel.id);
  const stateRef = useRef(loveState);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIDRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const reelChanged =
      reelIDRef.current !== reel.id;

    reelIDRef.current = reel.id;

    if (reelChanged) {
      requestIDRef.current += 1;
      savingRef.current = false;
      setSaving(false);
    }

    if (savingRef.current && !reelChanged) {
      return;
    }

    const nextState = createInitialState(reel);

    stateRef.current = nextState;
    setLoveState(nextState);
    setError(null);
  }, [
    reel.id,
    reel.is_loved_by_me,
    reel.likes_count,
    reel.current_user_reaction,
  ]);

  const commitState = useCallback(
    (
      nextState: ReelLoveState,
      notifyParent: boolean,
    ) => {
      stateRef.current = nextState;

      if (!mountedRef.current) {
        return;
      }

      setLoveState(nextState);

      if (notifyParent) {
        onChangeRef.current?.(nextState);
      }
    },
    [],
  );

  const updateLove = useCallback(
    async (shouldLove: boolean) => {
      if (savingRef.current) {
        return;
      }

      const previousState = stateRef.current;

      if (previousState.isLoved === shouldLove) {
        return;
      }

      const reelID = reelIDRef.current;
      const requestID = requestIDRef.current + 1;

      requestIDRef.current = requestID;
      savingRef.current = true;

      setSaving(true);
      setError(null);

      const hadPreviousReaction = Boolean(
        previousState.currentUserReaction,
      );

      const optimisticLikesCount = shouldLove
        ? previousState.likesCount +
          (hadPreviousReaction ? 0 : 1)
        : Math.max(
            0,
            previousState.likesCount - 1,
          );

      const optimisticState: ReelLoveState = {
        isLoved: shouldLove,
        likesCount: optimisticLikesCount,
        currentUserReaction: shouldLove
          ? "love"
          : "",
      };

      commitState(optimisticState, true);

      try {
        const response = shouldLove
          ? await setPostReaction(reelID, "love")
          : await removePostReaction(reelID);

        const requestIsCurrent =
          mountedRef.current &&
          requestIDRef.current === requestID &&
          reelIDRef.current === reelID;

        if (!requestIsCurrent) {
          return;
        }

        const responseReaction =
          normalizeReaction(
            response.reaction_type ??
              response.summary
                ?.current_user_reaction,
          );

        const finalReaction =
          responseReaction ||
          (shouldLove ? "love" : "");

        const finalState: ReelLoveState = {
          isLoved: finalReaction === "love",
          likesCount: normalizeLikesCount(
            response.summary?.total,
            optimisticState.likesCount,
          ),
          currentUserReaction: finalReaction,
        };

        commitState(finalState, true);
      } catch (requestError) {
        const requestIsCurrent =
          mountedRef.current &&
          requestIDRef.current === requestID &&
          reelIDRef.current === reelID;

        if (!requestIsCurrent) {
          return;
        }

        commitState(previousState, true);
        setError(getErrorMessage(requestError));
      } finally {
        const requestIsCurrent =
          requestIDRef.current === requestID &&
          reelIDRef.current === reelID;

        if (requestIsCurrent) {
          savingRef.current = false;

          if (mountedRef.current) {
            setSaving(false);
          }
        }
      }
    },
    [commitState],
  );

  const toggleLove = useCallback(async () => {
    await updateLove(!stateRef.current.isLoved);
  }, [updateLove]);

  const loveFromDoubleTap =
    useCallback(async () => {
      setHeartAnimationKey(
        (currentKey) => currentKey + 1,
      );

      if (stateRef.current.isLoved) {
        return;
      }

      await updateLove(true);
    }, [updateLove]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoved: loveState.isLoved,
    likesCount: loveState.likesCount,
    currentUserReaction:
      loveState.currentUserReaction,

    saving,
    error,
    heartAnimationKey,

    toggleLove,
    loveFromDoubleTap,
    clearError,
  };
};

export default useReelLove;