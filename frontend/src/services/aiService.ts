const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5000/api"
).replace(/\/+$/, "");

export type AIMessageRole =
  | "user"
  | "assistant";

export type AIMessageSource =
  | "user"
  | "knowledge"
  | "gemini";

export type AIConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AIMessage = {
  id: string;
  conversation_id: string;
  role: AIMessageRole;
  content: string;
  source: AIMessageSource;
  created_at: string;
};

type ChatsResponse = {
  chats: AIConversation[];
};

type MessagesResponse = {
  messages: AIMessage[];
};

type ErrorResponse = {
  error?: string;
};

type ConversationStreamPayload = {
  conversation: AIConversation;
};

type UserMessageStreamPayload = {
  message: AIMessage;
};

type DeltaStreamPayload = {
  text: string;
};

type DoneStreamPayload = {
  conversation: AIConversation;
  message: AIMessage;
};

export type AIStreamHandlers = {
  onConversation?: (
    conversation: AIConversation,
  ) => void;
  onUserMessage?: (
    message: AIMessage,
  ) => void;
  onDelta?: (text: string) => void;
  onDone?: (
    message: AIMessage,
    conversation: AIConversation,
  ) => void;
};

export class AIRequestError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status = 0,
  ) {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
  }
}

const getAuthHeaders = (
  includeJSON = false,
): HeadersInit => {
  const token =
    sessionStorage.getItem("token");

  if (!token) {
    throw new AIRequestError(
      "Please log in to use Everest AI.",
      401,
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  if (includeJSON) {
    headers["Content-Type"] =
      "application/json";
  }

  return headers;
};

const getErrorMessage = async (
  response: Response,
): Promise<string> => {
  try {
    const data =
      (await response.json()) as
        ErrorResponse;

    if (data.error?.trim()) {
      return data.error;
    }
  } catch {
    // The fallback below handles non-JSON errors.
  }

  return response.status === 401
    ? "Please log in to use Everest AI."
    : "Everest AI could not complete the request.";
};

const requestJSON = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...init,
      headers: {
        ...getAuthHeaders(
          init.body !== undefined,
        ),
        ...init.headers,
      },
    },
  );

  if (!response.ok) {
    throw new AIRequestError(
      await getErrorMessage(response),
      response.status,
    );
  }

  return (await response.json()) as T;
};

export const getAIChats = async (
  signal?: AbortSignal,
): Promise<AIConversation[]> => {
  const response =
    await requestJSON<ChatsResponse>(
      "/ai/chats",
      { signal },
    );

  return response.chats;
};

export const getAIMessages = async (
  conversationID: string,
  signal?: AbortSignal,
): Promise<AIMessage[]> => {
  const response =
    await requestJSON<MessagesResponse>(
      `/ai/chats/${encodeURIComponent(
        conversationID,
      )}/messages`,
      { signal },
    );

  return response.messages;
};

export const deleteAIChat = async (
  conversationID: string,
): Promise<void> => {
  await requestJSON<{ deleted: boolean }>(
    `/ai/chats/${encodeURIComponent(
      conversationID,
    )}`,
    {
      method: "DELETE",
    },
  );
};

export const clearAIChats =
  async (): Promise<void> => {
    await requestJSON<{ deleted: boolean }>(
      "/ai/chats",
      {
        method: "DELETE",
      },
    );
  };

type ParsedSSEEvent = {
  event: string;
  data: string;
};

const parseSSEBlock = (
  block: string,
): ParsedSSEEvent | null => {
  let event = "message";
  const dataLines: string[] = [];

  block
    .split(/\r?\n/)
    .forEach((line) => {
      if (
        line.startsWith(":") ||
        line.trim() === ""
      ) {
        return;
      }

      if (line.startsWith("event:")) {
        event = line
          .slice("event:".length)
          .trim();
        return;
      }

      if (line.startsWith("data:")) {
        dataLines.push(
          line
            .slice("data:".length)
            .trimStart(),
        );
      }
    });

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
};

const dispatchSSEEvent = (
  parsedEvent: ParsedSSEEvent,
  handlers: AIStreamHandlers,
) => {
  const payload = JSON.parse(
    parsedEvent.data,
  ) as unknown;

  switch (parsedEvent.event) {
    case "conversation": {
      const data =
        payload as
          ConversationStreamPayload;

      handlers.onConversation?.(
        data.conversation,
      );
      break;
    }

    case "user_message": {
      const data =
        payload as
          UserMessageStreamPayload;

      handlers.onUserMessage?.(
        data.message,
      );
      break;
    }

    case "delta": {
      const data =
        payload as DeltaStreamPayload;

      if (data.text) {
        handlers.onDelta?.(data.text);
      }
      break;
    }

    case "done": {
      const data =
        payload as DoneStreamPayload;

      handlers.onDone?.(
        data.message,
        data.conversation,
      );
      break;
    }

    case "error": {
      const data =
        payload as ErrorResponse;

      throw new AIRequestError(
        data.error ||
          "Everest AI could not reply.",
      );
    }

    default:
      break;
  }
};

export const streamAIMessage = async ({
  conversationID,
  message,
  signal,
  handlers,
}: {
  conversationID?: string;
  message: string;
  signal?: AbortSignal;
  handlers: AIStreamHandlers;
}): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/ai/messages`,
    {
      method: "POST",
      headers: {
        ...(
          getAuthHeaders(
            true,
          ) as Record<string, string>
        ),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        conversation_id:
          conversationID || "",
        message,
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new AIRequestError(
      await getErrorMessage(response),
      response.status,
    );
  }

  if (!response.body) {
    throw new AIRequestError(
      "Streaming is unavailable in this browser.",
    );
  }

  const reader =
    response.body.getReader();

  const decoder = new TextDecoder();
  let buffer = "";
  let streamCompleted = false;

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      buffer += decoder.decode(value, {
        stream: !done,
      });

      let boundaryMatch =
        buffer.match(/\r?\n\r?\n/);

      while (
        boundaryMatch?.index !==
        undefined
      ) {
        const boundaryIndex =
          boundaryMatch.index;

        const block = buffer.slice(
          0,
          boundaryIndex,
        );

        buffer = buffer.slice(
          boundaryIndex +
            boundaryMatch[0].length,
        );

        const parsedEvent =
          parseSSEBlock(block);

        if (parsedEvent) {
          dispatchSSEEvent(
            parsedEvent,
            handlers,
          );

          if (
            parsedEvent.event === "done"
          ) {
            streamCompleted = true;
          }
        }

        boundaryMatch =
          buffer.match(/\r?\n\r?\n/);
      }

      if (done) {
        break;
      }
    }

    const finalEvent =
      parseSSEBlock(buffer);

    if (finalEvent) {
      dispatchSSEEvent(
        finalEvent,
        handlers,
      );

      if (finalEvent.event === "done") {
        streamCompleted = true;
      }
    }

    if (!streamCompleted) {
      throw new AIRequestError(
        "The AI response ended unexpectedly. Please try again.",
      );
    }
  } finally {
    reader.releaseLock();
  }
};