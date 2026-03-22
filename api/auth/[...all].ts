import { getAuth } from "../../src/lib/better-auth.js";

export async function GET(request: Request) {
  const auth = getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const auth = getAuth();
  return auth.handler(request);
}

export async function OPTIONS(request: Request) {
  const auth = getAuth();
  return auth.handler(request);
}
