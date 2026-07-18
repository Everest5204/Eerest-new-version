import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Send, X } from "lucide-react";

type CommentInputProps = {
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  onSubmit: (text: string) => Promise<void> | void;
  onCancel?: () => void;
};

const DEFAULT_MAX_LENGTH = 2000;

const CommentInput = ({
  initialValue = "",
  placeholder = "Write a comment...",
  submitLabel = "Send",
  autoFocus = false,
  disabled = false,
  maxLength = DEFAULT_MAX_LENGTH,
  onSubmit,
  onCancel,
}: CommentInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [text, setText] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const cleanText = text.trim();
  const hasText = cleanText.length > 0;
  const canSubmit = hasText && !disabled && !submitting;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, text]);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!autoFocus) return;

    const timeoutID = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(timeoutID);
    };
  }, [autoFocus]);

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!canSubmit) return;

    try {
      setSubmitting(true);
      await onSubmit(cleanText);

      if (!initialValue) {
        setText("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="commentInputForm" onSubmit={handleSubmit}>
      <div className="commentInputBox">
        <textarea
          ref={textareaRef}
          className="commentInputTextarea"
          value={text}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled || submitting}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }

            if (event.key === "Escape" && onCancel) {
              onCancel();
            }
          }}
        />

        {onCancel ? (
          <button
            type="button"
            className="commentInputCancel"
            onClick={onCancel}
            disabled={disabled || submitting}
            aria-label="Cancel"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        ) : null}

        <button
          type="submit"
          className={`commentInputSubmit ${hasText ? "active" : ""}`}
          disabled={!canSubmit}
          aria-label={submitLabel}
        >
          <Send size={25} strokeWidth={2.3} />
        </button>
      </div>
    </form>
  );
};

export default CommentInput;