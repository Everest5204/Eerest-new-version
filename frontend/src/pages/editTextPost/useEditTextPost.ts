import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  normalizeTextPost,
  type TextFeedPost,
  type TextPostBackground,
  type TextPostStyle,
} from "../../components/textpost/textPostService";
import {
  getEditableTextPost,
  getTextPostEditErrorMessage,
  updateTextPost,
} from "../../services/textPostEditService";
import { usePostEditActions } from "../editMediaPost/PostEditContext";

export const MAX_EDIT_TEXT_LENGTH = 650;

const DEFAULT_BACKGROUND: TextPostBackground = {
  kind: "plain",
  value: "#ffffff",
};

const DEFAULT_TEXT_COLOR = "#111827";
const DEFAULT_TEXT_STYLE: TextPostStyle = "bold_center";

type EditTextPostLocationState = {
  post?: unknown;
  returnTo?: string;
};

type TextPostSnapshot = {
  text: string;
  background: TextPostBackground;
  textColor: string;
  textStyle: TextPostStyle;
};

const isTextPostStyle = (value: unknown): value is TextPostStyle => {
  return (
    value === "bold_center" ||
    value === "normal_center" ||
    value === "bold_left" ||
    value === "normal_left"
  );
};

const createSnapshot = (post: TextFeedPost): TextPostSnapshot => {
  return {
    text: String(post.text ?? post.caption ?? "").trim(),

    background: post.text_background
      ? {
          kind: post.text_background.kind,
          value: post.text_background.value,
        }
      : DEFAULT_BACKGROUND,

    textColor: post.text_color?.trim() || DEFAULT_TEXT_COLOR,

    textStyle: isTextPostStyle(post.text_style)
      ? post.text_style
      : DEFAULT_TEXT_STYLE,
  };
};

const snapshotsAreEqual = (
  current: TextPostSnapshot,
  original: TextPostSnapshot
): boolean => {
  return (
    current.text.trim() === original.text.trim() &&
    current.background.kind === original.background.kind &&
    current.background.value === original.background.value &&
    current.textColor === original.textColor &&
    current.textStyle === original.textStyle
  );
};

const EMPTY_SNAPSHOT: TextPostSnapshot = {
  text: "",
  background: DEFAULT_BACKGROUND,
  textColor: DEFAULT_TEXT_COLOR,
  textStyle: DEFAULT_TEXT_STYLE,
};

export const useEditTextPost = () => {
  const { postId = "" } = useParams<{ postId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    beginOptimisticEdit,
    commitOptimisticEdit,
    rollbackOptimisticEdit,
  } = usePostEditActions();

  const locationState =
    (location.state as EditTextPostLocationState | null) ?? null;

  const routePost = useMemo<TextFeedPost | null>(() => {
    if (!locationState?.post) {
      return null;
    }

    const normalizedPost = normalizeTextPost(locationState.post);

    if (
      !normalizedPost.id ||
      normalizedPost.id !== postId ||
      normalizedPost.type !== "text"
    ) {
      return null;
    }

    return normalizedPost;
  }, [locationState?.post, postId]);

  const initialSnapshot = routePost
    ? createSnapshot(routePost)
    : EMPTY_SNAPSHOT;

  const [post, setPost] = useState<TextFeedPost | null>(routePost);
  const [text, setTextState] = useState(initialSnapshot.text);
  const [background, setBackgroundState] =
    useState<TextPostBackground>(initialSnapshot.background);
  const [textColor, setTextColorState] = useState(
    initialSnapshot.textColor
  );
  const [textStyle, setTextStyleState] = useState<TextPostStyle>(
    initialSnapshot.textStyle
  );

  const [isLoading, setIsLoading] = useState(!routePost);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const originalSnapshotRef =
    useRef<TextPostSnapshot>(initialSnapshot);
  const userChangedRef = useRef(false);

  const applyPost = useCallback((nextPost: TextFeedPost) => {
    const snapshot = createSnapshot(nextPost);

    setPost(nextPost);
    setTextState(snapshot.text);
    setBackgroundState(snapshot.background);
    setTextColorState(snapshot.textColor);
    setTextStyleState(snapshot.textStyle);

    originalSnapshotRef.current = snapshot;
    userChangedRef.current = false;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    if (!postId.trim()) {
      setPost(null);
      setIsLoading(false);
      setError("Text post ID is missing");
      return () => controller.abort();
    }

    if (routePost) {
      applyPost(routePost);
      setIsLoading(false);
    } else {
      setPost(null);
      setIsLoading(true);
    }

    setError(null);

    const loadPost = async () => {
      try {
        const latestPost = await getEditableTextPost(
          postId,
          controller.signal
        );

        if (!isActive) {
          return;
        }

        /*
         * Route state দিয়ে page সঙ্গে সঙ্গে দেখানো হয়।
         * User লেখা শুরু না করলে database-এর latest version বসানো হবে।
         */
        if (!userChangedRef.current) {
          applyPost(latestPost);
        }
      } catch (loadError) {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setError(getTextPostEditErrorMessage(loadError));
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadPost();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    applyPost,
    postId,
    reloadVersion,
    routePost,
  ]);

  const currentSnapshot = useMemo<TextPostSnapshot>(
    () => ({
      text,
      background,
      textColor,
      textStyle,
    }),
    [background, text, textColor, textStyle]
  );

  const isDirty = useMemo(() => {
    return !snapshotsAreEqual(
      currentSnapshot,
      originalSnapshotRef.current
    );
  }, [currentSnapshot]);

  const characterCount = text.length;
  const remainingCharacters =
    MAX_EDIT_TEXT_LENGTH - characterCount;

  const canSave =
    Boolean(post?.id) &&
    Boolean(post?.updated_at) &&
    text.trim().length > 0 &&
    text.trim().length <= MAX_EDIT_TEXT_LENGTH &&
    isDirty &&
    !isLoading &&
    !isSaving;

  const changeText = useCallback((value: string) => {
    userChangedRef.current = true;
    setError(null);
    setTextState(value.slice(0, MAX_EDIT_TEXT_LENGTH));
  }, []);

  const changeBackground = useCallback(
    (
      nextBackground: TextPostBackground,
      suggestedTextColor?: string
    ) => {
      userChangedRef.current = true;
      setError(null);

      setBackgroundState({
        kind: nextBackground.kind,
        value: nextBackground.value,
      });

      if (suggestedTextColor?.trim()) {
        setTextColorState(suggestedTextColor.trim());
      }
    },
    []
  );

  const changeTextColor = useCallback((value: string) => {
    userChangedRef.current = true;
    setError(null);
    setTextColorState(value.trim() || DEFAULT_TEXT_COLOR);
  }, []);

  const changeTextStyle = useCallback(
    (value: TextPostStyle) => {
      userChangedRef.current = true;
      setError(null);
      setTextStyleState(value);
    },
    []
  );

  const goBack = useCallback(
    (replace = false) => {
      const returnTo = locationState?.returnTo?.trim();

      if (
        returnTo &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
      ) {
        navigate(returnTo, { replace });
        return;
      }

      if (window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate("/", { replace: true });
    },
    [locationState?.returnTo, navigate]
  );

  const closeEditor = useCallback(() => {
    if (
      isDirty &&
      !window.confirm("Discard your unsaved changes?")
    ) {
      return;
    }

    goBack(false);
  }, [goBack, isDirty]);

  const reloadPost = useCallback(() => {
    userChangedRef.current = false;
    setError(null);
    setReloadVersion((current) => current + 1);
  }, []);

  const savePost = useCallback(async () => {
    if (!canSave || !post) {
      return;
    }

    const cleanText = text.trim();
    const operationId = beginOptimisticEdit(post, {
      ...post,

      type: "text",
      text: cleanText,
      caption: cleanText,
      media: [],

      text_background: {
        kind: background.kind,
        value: background.value,
      },

      text_color: textColor,
      text_style: textStyle,
      updated_at: new Date().toISOString(),
    });

    setIsSaving(true);
    setError(null);

    try {
      const savedPost = await updateTextPost({
        postId: post.id,
        text: cleanText,

        background: {
          kind: background.kind,
          value: background.value,
        },

        textColor,
        textStyle,
        expectedUpdatedAt: post.updated_at,
      });

      commitOptimisticEdit(
        post.id,
        operationId,
        savedPost
      );

      applyPost(savedPost);

      /*
       * Context-এ updated post commit হওয়ার পর feed/profile page-এ যাওয়া হয়।
       * তাই refresh ছাড়াই নতুন text/background দেখা যাবে।
       */
      goBack(true);
    } catch (saveError) {
      rollbackOptimisticEdit(post.id, operationId);
      setError(getTextPostEditErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }, [
    applyPost,
    background,
    beginOptimisticEdit,
    canSave,
    commitOptimisticEdit,
    goBack,
    post,
    rollbackOptimisticEdit,
    text,
    textColor,
    textStyle,
  ]);

  return {
    post,

    text,
    background,
    textColor,
    textStyle,

    characterCount,
    remainingCharacters,
    maxTextLength: MAX_EDIT_TEXT_LENGTH,

    isLoading,
    isSaving,
    isDirty,
    canSave,
    error,

    changeText,
    changeBackground,
    changeTextColor,
    changeTextStyle,

    savePost,
    closeEditor,
    reloadPost,
  };
};

export default useEditTextPost;