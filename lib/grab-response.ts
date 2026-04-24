export type GrabJsonPayload = Record<string, unknown>;

export async function parseGrabResponse(response: Response): Promise<{
  payload: GrabJsonPayload | null;
  text: string;
}> {
  const text = await response.text();

  if (!text) {
    return {
      payload: null,
      text: ""
    };
  }

  try {
    return {
      payload: JSON.parse(text) as GrabJsonPayload,
      text
    };
  } catch {
    return {
      payload: null,
      text
    };
  }
}

export function getGrabErrorMessage(
  response: Response,
  payload: GrabJsonPayload | null,
  fallback: string,
  rawText?: string
) {
  if (payload) {
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  }

  if (rawText?.trim()) {
    return rawText.trim();
  }

  return `${fallback} (HTTP ${response.status})`;
}
