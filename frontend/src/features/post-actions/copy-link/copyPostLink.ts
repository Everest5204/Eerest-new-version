export class CopyPostLinkError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "CopyPostLinkError";
  }
}

export const buildPostLink = (
  postID: string
): string => {
  const cleanPostID = postID.trim();

  if (!cleanPostID) {
    throw new CopyPostLinkError(
      "Post id is required"
    );
  }

  if (typeof window === "undefined") {
    throw new CopyPostLinkError(
      "Post link is unavailable"
    );
  }

  const postPath =
    `/post/${encodeURIComponent(
      cleanPostID
    )}`;

  return new URL(
    postPath,
    window.location.origin
  ).toString();
};

const copyUsingFallback = (
  value: string
): boolean => {
  if (
    typeof document === "undefined"
  ) {
    return false;
  }

  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.value = value;
  textarea.readOnly = true;

  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents =
    "none";

  document.body.appendChild(
    textarea
  );

  try {
    textarea.focus();
    textarea.select();

    textarea.setSelectionRange(
      0,
      textarea.value.length
    );

    return document.execCommand(
      "copy"
    );
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
};

export const copyPostLink = async (
  postID: string
): Promise<string> => {
  const postURL =
    buildPostLink(postID);

  if (
    typeof navigator !== "undefined" &&
    window.isSecureContext &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(
        postURL
      );

      return postURL;
    } catch {
      // Clipboard permission ব্যর্থ হলে
      // নিচের fallback ব্যবহার হবে।
    }
  }

  const copied =
    copyUsingFallback(postURL);

  if (!copied) {
    throw new CopyPostLinkError(
      "Unable to copy post link"
    );
  }

  return postURL;
};