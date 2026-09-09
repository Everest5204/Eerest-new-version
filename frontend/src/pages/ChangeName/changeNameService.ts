import api from "../../services/api";

export type NameStatus = {
  first_name: string;
  last_name: string;
  can_change: boolean;
  last_changed_at?: string;
  next_change_at?: string;
};

export type ChangeNamePayload = {
  first_name: string;
  last_name: string;
};

type NameStatusResponse = {
  name: NameStatus;
};

type APIErrorResponse = {
  error?: string;
  next_change_at?: string;
};

type APIErrorShape = {
  response?: {
    status?: number;
    data?: APIErrorResponse;
  };
  message?: string;
};

export class ChangeNameAPIError extends Error {
  statusCode: number;
  nextChangeAt?: string;

  constructor(
    message: string,
    statusCode = 0,
    nextChangeAt?: string,
  ) {
    super(message);

    this.name = "ChangeNameAPIError";
    this.statusCode = statusCode;
    this.nextChangeAt = nextChangeAt;
  }
}

const getAPIError = (
  error: unknown,
): ChangeNameAPIError => {
  const apiError = error as APIErrorShape;

  const statusCode =
    apiError.response?.status ?? 0;

  const responseData =
    apiError.response?.data;

  const message =
    responseData?.error ??
    apiError.message ??
    "Unable to process name request";

  return new ChangeNameAPIError(
    message,
    statusCode,
    responseData?.next_change_at,
  );
};

export const getNameStatus =
  async (): Promise<NameStatus> => {
    try {
      const response =
        await api.get<NameStatusResponse>(
          "/user/name",
        );

      return response.data.name;
    } catch (error) {
      throw getAPIError(error);
    }
  };

export const updateName = async (
  payload: ChangeNamePayload,
): Promise<NameStatus> => {
  try {
    const response =
      await api.patch<NameStatusResponse>(
        "/user/name",
        payload,
      );

    return response.data.name;
  } catch (error) {
    throw getAPIError(error);
  }
};