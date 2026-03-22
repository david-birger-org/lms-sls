async function getAuth() {
  const module = await import("../../src/lib/better-auth.js");
  return module.auth;
}

export async function GET(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

export async function OPTIONS(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}
