const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export function json(data: unknown, init: ResponseInit = {}) {
  const response = new Response(JSON.stringify(data), init);

  if (!response.headers.has("content-type")) {
    response.headers.set("content-type", JSON_CONTENT_TYPE);
  }

  return response;
}
