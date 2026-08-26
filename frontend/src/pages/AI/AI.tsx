import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
  KeyboardEvent,
} from "react";

import {
  LoaderCircle,
  Menu,
  Moon,
  Plus,
  Send,
  Sun,
  X,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import useBackDismiss from
  "../../hooks/useBackDismiss";

import {
  AIRequestError,
  clearAIChats,
  deleteAIChat,
  getAIChats,
  getAIMessages,
  streamAIMessage,
} from "../../services/aiService";

import type {
  AIConversation,
  AIMessage,
} from "../../services/aiService";

import "./AI.css";

const MAX_MESSAGE_LENGTH = 4000;

const THEME_STORAGE_KEY =
  "everest-ai-theme";

const createTemporaryMessage = ({
  id,
  conversationID,
  role,
  content,
}: {
  id: string;
  conversationID: string;
  role: "user" | "assistant";
  content: string;
}): AIMessage => ({
  id,
  conversation_id: conversationID,
  role,
  content,
  source:
    role === "user" ? "user" : "gemini",
  created_at: new Date().toISOString(),
});

const sortChats = (
  chats: AIConversation[],
): AIConversation[] =>
  [...chats].sort(
    (firstChat, secondChat) =>
      new Date(
        secondChat.updated_at,
      ).getTime() -
      new Date(
        firstChat.updated_at,
      ).getTime(),
  );

const upsertChat = (
  chats: AIConversation[],
  incomingChat: AIConversation,
): AIConversation[] =>
  sortChats([
    incomingChat,
    ...chats.filter(
      (chat) =>
        chat.id !== incomingChat.id,
    ),
  ]);

const getInitialDarkMode = (): boolean => {
  const savedTheme =
    localStorage.getItem(
      THEME_STORAGE_KEY,
    );

  if (savedTheme === "dark") {
    return true;
  }

  if (savedTheme === "light") {
    return false;
  }

  return window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
};

const AI = () => {
  const navigate = useNavigate();

  const [
    conversations,
    setConversations,
  ] = useState<AIConversation[]>([]);

  const [
    activeConversationID,
    setActiveConversationID,
  ] = useState<string | null>(null);

  const [messages, setMessages] =
    useState<AIMessage[]>([]);

  const [draft, setDraft] =
    useState("");

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [darkMode, setDarkMode] =
    useState(getInitialDarkMode);

  const [
    conversationsLoading,
    setConversationsLoading,
  ] = useState(true);

  const [
    messagesLoading,
    setMessagesLoading,
  ] = useState(false);

  const [sending, setSending] =
    useState(false);

  const [
    deletingConversationID,
    setDeletingConversationID,
  ] = useState<string | null>(null);

  const [clearingChats, setClearingChats] =
    useState(false);

  const [error, setError] =
    useState("");

  const composerRef =
    useRef<HTMLTextAreaElement | null>(
      null,
    );

  const messagesViewportRef =
    useRef<HTMLDivElement | null>(null);

  const streamAbortRef =
    useRef<AbortController | null>(null);

  const historyAbortRef =
    useRef<AbortController | null>(null);

  const shouldStickToBottomRef =
    useRef(true);

  const closeDrawer =
    useCallback(() => {
      setDrawerOpen(false);
    }, []);

  useBackDismiss({
    isOpen: drawerOpen,
    onDismiss: closeDrawer,
    stateKey: "ai-drawer",
  });

  useEffect(() => {
    if (
      !sessionStorage.getItem("token")
    ) {
      navigate("/login", {
        replace: true,
      });

      return;
    }

    const controller =
      new AbortController();

    const loadConversations =
      async () => {
        try {
          setConversationsLoading(true);

          const chats =
            await getAIChats(
              controller.signal,
            );

          setConversations(
            sortChats(chats),
          );
        } catch (loadError) {
          if (
            loadError instanceof DOMException &&
            loadError.name ===
              "AbortError"
          ) {
            return;
          }

          if (
            loadError instanceof
              AIRequestError &&
            loadError.status === 401
          ) {
            navigate("/login", {
              replace: true,
            });
            return;
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Recent chats could not be loaded.",
          );
        } finally {
          setConversationsLoading(
            false,
          );
        }
      };

    void loadConversations();

    return () => {
      controller.abort();
    };
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      darkMode ? "dark" : "light",
    );
  }, [darkMode]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const textarea =
      composerRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";

    textarea.style.height =
      `${Math.min(
        textarea.scrollHeight,
        140,
      )}px`;
  }, [draft]);

  useEffect(() => {
    if (
      !shouldStickToBottomRef.current
    ) {
      return;
    }

    const frameID =
      window.requestAnimationFrame(() => {
        const viewport =
          messagesViewportRef.current;

        if (viewport) {
          viewport.scrollTop =
            viewport.scrollHeight;
        }
      });

    return () => {
      window.cancelAnimationFrame(
        frameID,
      );
    };
  }, [messages]);

  useEffect(
    () => () => {
      streamAbortRef.current?.abort();
      historyAbortRef.current?.abort();
    },
    [],
  );

  const handleMessagesScroll = () => {
    const viewport =
      messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight -
      viewport.scrollTop -
      viewport.clientHeight;

    shouldStickToBottomRef.current =
      distanceFromBottom < 120;
  };

  const handleNewChat =
    useCallback(() => {
      streamAbortRef.current?.abort();
      historyAbortRef.current?.abort();

      setSending(false);
      setActiveConversationID(null);
      setMessages([]);
      setDraft("");
      setError("");
      setDrawerOpen(false);

      shouldStickToBottomRef.current =
        true;

      window.requestAnimationFrame(
        () => {
          composerRef.current?.focus();
        },
      );
    }, []);

  const handleOpenConversation =
    useCallback(
      async (conversationID: string) => {
        if (
          activeConversationID ===
            conversationID &&
          messages.length > 0
        ) {
          setDrawerOpen(false);
          return;
        }

        streamAbortRef.current?.abort();
        historyAbortRef.current?.abort();

        const controller =
          new AbortController();

        historyAbortRef.current =
          controller;

        setActiveConversationID(
          conversationID,
        );

        setMessages([]);
        setMessagesLoading(true);
        setError("");
        setDrawerOpen(false);

        shouldStickToBottomRef.current =
          true;

        try {
          const conversationMessages =
            await getAIMessages(
              conversationID,
              controller.signal,
            );

          setMessages(
            conversationMessages,
          );
        } catch (loadError) {
          if (
            loadError instanceof DOMException &&
            loadError.name ===
              "AbortError"
          ) {
            return;
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Messages could not be loaded.",
          );
        } finally {
          if (
            historyAbortRef.current ===
            controller
          ) {
            historyAbortRef.current =
              null;

            setMessagesLoading(false);
          }
        }
      },
      [
        activeConversationID,
        messages.length,
      ],
    );

  const handleDeleteConversation =
    useCallback(
      async (
        conversationID: string,
      ) => {
        if (
          deletingConversationID ||
          clearingChats
        ) {
          return;
        }

        try {
          setDeletingConversationID(
            conversationID,
          );
          setError("");

          await deleteAIChat(
            conversationID,
          );

          setConversations(
            (currentChats) =>
              currentChats.filter(
                (chat) =>
                  chat.id !==
                  conversationID,
              ),
          );

          if (
            activeConversationID ===
            conversationID
          ) {
            handleNewChat();
          }
        } catch (deleteError) {
          setError(
            deleteError instanceof Error
              ? deleteError.message
              : "The chat could not be deleted.",
          );
        } finally {
          setDeletingConversationID(null);
        }
      },
      [
        activeConversationID,
        clearingChats,
        deletingConversationID,
        handleNewChat,
      ],
    );

  const handleClearChats =
    useCallback(async () => {
      if (
        conversations.length === 0 ||
        clearingChats
      ) {
        return;
      }

      const confirmed = window.confirm(
        "Delete all Mongosky AI chats? This cannot be undone.",
      );

      if (!confirmed) {
        return;
      }

      try {
        setClearingChats(true);
        setError("");

        await clearAIChats();

        setConversations([]);
        handleNewChat();
      } catch (clearError) {
        setError(
          clearError instanceof Error
            ? clearError.message
            : "Chats could not be cleared.",
        );
      } finally {
        setClearingChats(false);
      }
    }, [
      clearingChats,
      conversations.length,
      handleNewChat,
    ]);

  const handleSend =
    useCallback(
      async (
        event?: FormEvent,
      ) => {
        event?.preventDefault();

        const cleanMessage =
          draft.trim();

        if (
          !cleanMessage ||
          sending ||
          messagesLoading
        ) {
          return;
        }

        const controller =
          new AbortController();

        streamAbortRef.current =
          controller;

        const temporaryUserID =
          `user-${crypto.randomUUID()}`;

        const temporaryAssistantID =
          `assistant-${crypto.randomUUID()}`;

        const temporaryUserMessage =
          createTemporaryMessage({
            id: temporaryUserID,
            conversationID:
              activeConversationID ?? "",
            role: "user",
            content: cleanMessage,
          });

        const temporaryAssistantMessage =
          createTemporaryMessage({
            id: temporaryAssistantID,
            conversationID:
              activeConversationID ?? "",
            role: "assistant",
            content: "",
          });

        setMessages(
          (currentMessages) => [
            ...currentMessages,
            temporaryUserMessage,
            temporaryAssistantMessage,
          ],
        );

        setDraft("");
        setSending(true);
        setError("");

        shouldStickToBottomRef.current =
          true;

        let accumulatedText = "";

        let renderFrameID:
          | number
          | null = null;

        const renderAccumulatedText =
          () => {
            renderFrameID = null;

            setMessages(
              (currentMessages) =>
                currentMessages.map(
                  (message) =>
                    message.id ===
                    temporaryAssistantID
                      ? {
                          ...message,
                          content:
                            accumulatedText,
                        }
                      : message,
                ),
            );
          };

        try {
          await streamAIMessage({
            conversationID:
              activeConversationID ??
              undefined,
            message: cleanMessage,
            signal: controller.signal,
            handlers: {
              onConversation:
                (conversation) => {
                  setActiveConversationID(
                    conversation.id,
                  );

                  setConversations(
                    (currentChats) =>
                      upsertChat(
                        currentChats,
                        conversation,
                      ),
                  );
                },

              onUserMessage:
                (savedMessage) => {
                  setMessages(
                    (currentMessages) =>
                      currentMessages.map(
                        (message) =>
                          message.id ===
                          temporaryUserID
                            ? savedMessage
                            : message,
                      ),
                  );
                },

              onDelta: (text) => {
                accumulatedText += text;

                if (
                  renderFrameID === null
                ) {
                  renderFrameID =
                    window.requestAnimationFrame(
                      renderAccumulatedText,
                    );
                }
              },

              onDone: (
                savedMessage,
                conversation,
              ) => {
                if (
                  renderFrameID !== null
                ) {
                  window.cancelAnimationFrame(
                    renderFrameID,
                  );

                  renderFrameID = null;
                }

                setMessages(
                  (currentMessages) =>
                    currentMessages.map(
                      (message) =>
                        message.id ===
                        temporaryAssistantID
                          ? savedMessage
                          : message,
                    ),
                );

                setConversations(
                  (currentChats) =>
                    upsertChat(
                      currentChats,
                      conversation,
                    ),
                );
              },
            },
          });
        } catch (sendError) {
          if (
            sendError instanceof DOMException &&
            sendError.name ===
              "AbortError"
          ) {
            return;
          }

          setMessages(
            (currentMessages) =>
              currentMessages.filter(
                (message) =>
                  message.id !==
                  temporaryAssistantID,
              ),
          );

          setError(
            sendError instanceof Error
              ? sendError.message
              : "Mongosky AI could not reply.",
          );
        } finally {
          if (
            renderFrameID !== null
          ) {
            window.cancelAnimationFrame(
              renderFrameID,
            );
          }

          if (
            streamAbortRef.current ===
            controller
          ) {
            streamAbortRef.current = null;
            setSending(false);
          }

          window.requestAnimationFrame(
            () => {
              composerRef.current?.focus();
            },
          );
        }
      },
      [
        activeConversationID,
        draft,
        messagesLoading,
        sending,
      ],
    );

  const handleComposerKeyDown = (
    event:
      KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    void handleSend();
  };

  const emptyStateVisible =
    !messagesLoading &&
    messages.length === 0;

  return (
    <div
      className={[
        "ai-page",
        darkMode ? "ai-dark" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="ai-header">
        <button
          className="ai-icon-button"
          type="button"
          aria-label="Open chat menu"
          aria-expanded={drawerOpen}
          onClick={() =>
            setDrawerOpen(true)
          }
        >
          <Menu
            size={24}
            strokeWidth={2.2}
          />
        </button>

        <div className="ai-brand">
          <span>Mongosky</span>
        </div>
      </header>

      <div
        ref={messagesViewportRef}
        className="ai-messages-viewport"
        onScroll={handleMessagesScroll}
      >
        {emptyStateVisible ? (
          <section
            className="ai-empty-state"
            aria-label="Start a conversation"
          >
            <p>How can I help you?</p>
          </section>
        ) : null}

        {messagesLoading ? (
          <div
            className="ai-loading-state"
            role="status"
          >
            <LoaderCircle
              className="ai-spin"
              size={25}
            />
            <span>Loading chat…</span>
          </div>
        ) : null}

        {messages.length > 0 ? (
          <div
            className="ai-message-list"
            aria-live="polite"
          >
            {messages.map((message) => (
              <article
                className={[
                  "ai-message",
                  `ai-message-${message.role}`,
                ].join(" ")}
                key={message.id}
              >
                <div className="ai-message-content">
                  {message.content ? (
                    message.content
                  ) : (
                    <span
                      className="ai-typing"
                      aria-label="Mongosky AI is typing"
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ai-composer-area">
        {error ? (
          <div
            className="ai-error"
            role="alert"
          >
            <span>{error}</span>

            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() =>
                setError("")
              }
            >
              <X size={18} />
            </button>
          </div>
        ) : null}

        <form
          className="ai-composer"
          onSubmit={(event) =>
            void handleSend(event)
          }
        >
          <textarea
            ref={composerRef}
            value={draft}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="Message Mongosky AI"
            placeholder="Message…"
            disabled={
              sending || messagesLoading
            }
            onChange={(event) =>
              setDraft(
                event.target.value,
              )
            }
            onKeyDown={
              handleComposerKeyDown
            }
          />

          <button
            className="ai-send-button"
            type="submit"
            aria-label="Send message"
            disabled={
              !draft.trim() ||
              sending ||
              messagesLoading
            }
          >
            {sending ? (
              <LoaderCircle
                className="ai-spin"
                size={23}
              />
            ) : (
              <Send
                size={23}
              />
            )}
          </button>
        </form>
      </div>

      {drawerOpen ? (
        <div className="ai-drawer-layer">
          <button
            className="ai-drawer-backdrop"
            type="button"
            aria-label="Close chat menu"
            onClick={closeDrawer}
          />

          <aside
            className="ai-drawer"
            aria-label="Mongosky AI menu"
          >
            <div className="ai-drawer-header">
              <strong>Mongosky</strong>

              <button
                className="ai-icon-button"
                type="button"
                aria-label="Close chat menu"
                onClick={closeDrawer}
              >
                <X size={26} />
              </button>
            </div>

            <div className="ai-drawer-actions">
              <button
                type="button"
                onClick={handleNewChat}
              >
                <Plus size={22} />
                <span>New Chat</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setDarkMode(
                    (currentMode) =>
                      !currentMode,
                  )
                }
              >
                {darkMode ? (
                  <Sun size={22} />
                ) : (
                  <Moon size={22} />
                )}

                <span>
                  {darkMode
                    ? "Light Mode"
                    : "Dark Mode"}
                </span>
              </button>
            </div>

            <div className="ai-drawer-divider" />

            <div className="ai-recent-heading">
              <span>Recent Chats</span>

              <button
                type="button"
                disabled={
                  conversations.length ===
                    0 || clearingChats
                }
                onClick={() =>
                  void handleClearChats()
                }
              >
                {clearingChats
                  ? "Clearing…"
                  : "Clear all"}
              </button>
            </div>

            <div className="ai-recent-list">
              {conversationsLoading ? (
                <div className="ai-drawer-loading">
                  <LoaderCircle
                    className="ai-spin"
                    size={21}
                  />
                  <span>
                    Loading chats…
                  </span>
                </div>
              ) : null}

              {!conversationsLoading &&
              conversations.length ===
                0 ? (
                <p className="ai-no-chats">
                  No recent chats
                </p>
              ) : null}

              {conversations.map(
                (conversation) => (
                  <div
                    className={[
                      "ai-recent-item",
                      activeConversationID ===
                      conversation.id
                        ? "active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={
                      conversation.id
                    }
                  >
                    <button
                      className="ai-recent-open"
                      type="button"
                      title={
                        conversation.title
                      }
                      onClick={() =>
                        void handleOpenConversation(
                          conversation.id,
                        )
                      }
                    >
                      {
                        conversation.title
                      }
                    </button>

                    <button
                      className="ai-recent-delete"
                      type="button"
                      aria-label={`Delete ${conversation.title}`}
                      disabled={
                        deletingConversationID ===
                        conversation.id
                      }
                      onClick={() =>
                        void handleDeleteConversation(
                          conversation.id,
                        )
                      }
                    >
                      {deletingConversationID ===
                      conversation.id ? (
                        <LoaderCircle
                          className="ai-spin"
                          size={17}
                        />
                      ) : (
                        <X size={18} />
                      )}
                    </button>
                  </div>
                ),
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
};

export default AI;
