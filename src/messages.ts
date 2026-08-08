export interface FocusExistingTabRequest {
  type: "focus-existing-tab";
  url: string;
}

export interface FocusExistingTabResponse {
  focused: boolean;
}

export interface UpdateClickInterceptorMessage {
  type: "update-click-interceptor";
  patterns: string[];
}

export function isFocusExistingTabRequest(value: unknown): value is FocusExistingTabRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "focus-existing-tab" && typeof message.url === "string";
}

export function isUpdateClickInterceptorMessage(
  value: unknown,
): value is UpdateClickInterceptorMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "update-click-interceptor"
    && Array.isArray(message.patterns)
    && message.patterns.every((pattern) => typeof pattern === "string");
}
