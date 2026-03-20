export function getErrorMessage(error: unknown, fallback = "Unexpected error") {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = Reflect.get(error, "message");

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}
