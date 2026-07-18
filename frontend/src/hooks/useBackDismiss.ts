import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";

const BACK_DISMISS_MARKER =
  "__everest_back_dismiss__";

type HistoryStateRecord = Record<string, unknown>;

export type UseBackDismissOptions = {
  isOpen: boolean;
  onDismiss: () => void;
  stateKey?: string;
  enabled?: boolean;
};

const toHistoryStateRecord = (
  value: unknown,
): HistoryStateRecord => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as HistoryStateRecord;
  }

  return {};
};

const getBackDismissMarker = (
  state: unknown,
): string | null => {
  const stateRecord = toHistoryStateRecord(state);
  const marker =
    stateRecord[BACK_DISMISS_MARKER];

  return typeof marker === "string"
    ? marker
    : null;
};

export const useBackDismiss = ({
  isOpen,
  onDismiss,
  stateKey = "overlay",
  enabled = true,
}: UseBackDismissOptions) => {
  const reactID = useId();

  const entryIDRef = useRef(
    `${stateKey}:${reactID}`,
  );

  const onDismissRef = useRef(onDismiss);

  const cleanupTimerRef =
    useRef<number | null>(null);

  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !enabled ||
      !isOpen
    ) {
      return;
    }

    const entryID = entryIDRef.current;

    /*
     * React StrictMode development-এ effect পুনরায়
     * চালালে pending history cleanup বাতিল করা হয়।
     */
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(
        cleanupTimerRef.current,
      );

      cleanupTimerRef.current = null;
    }

    const currentMarker = getBackDismissMarker(
      window.history.state,
    );

    /*
     * একই overlay-এর history entry আগে থেকেই থাকলে
     * duplicate entry তৈরি করা হবে না।
     */
    if (currentMarker !== entryID) {
      const currentState =
        toHistoryStateRecord(
          window.history.state,
        );

      window.history.pushState(
        {
          ...currentState,
          [BACK_DISMISS_MARKER]: entryID,
        },
        "",
        window.location.href,
      );
    }

    let dismissedByBackButton = false;

    const handlePopState = (
      event: PopStateEvent,
    ) => {
      /*
       * এই overlay-এর entry এখনো active থাকলে
       * overlay বন্ধ করার প্রয়োজন নেই।
       */
      if (
        getBackDismissMarker(event.state) ===
        entryID
      ) {
        return;
      }

      if (dismissedByBackButton) {
        return;
      }

      dismissedByBackButton = true;
      onDismissRef.current();
    };

    window.addEventListener(
      "popstate",
      handlePopState,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState,
      );

      /*
       * Back button দিয়ে বন্ধ হলে history entry
       * ইতোমধ্যে remove হয়েছে।
       */
      if (dismissedByBackButton) {
        return;
      }

      /*
       * Close button বা অন্য UI action দিয়ে overlay
       * বন্ধ হলে artificial history entry remove হবে।
       */
      if (
        getBackDismissMarker(
          window.history.state,
        ) !== entryID
      ) {
        return;
      }

      cleanupTimerRef.current =
        window.setTimeout(() => {
          cleanupTimerRef.current = null;

          if (
            getBackDismissMarker(
              window.history.state,
            ) === entryID
          ) {
            window.history.back();
          }
        }, 0);
    };
  }, [enabled, isOpen]);

  const dismiss = useCallback(() => {
    onDismissRef.current();
  }, []);

  return {
    dismiss,
  };
};

export default useBackDismiss;