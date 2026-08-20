import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/**
 * The gate (PLAN.md §9 PR-23).
 *
 * Signature-only: middleware runs on every request, and a database round trip
 * here would put MySQL in the path of static assets. A valid signature proves
 * the token was minted by this app and has not expired — pages that need the
 * *user* still call getSession(), which re-reads the row.
 *
 * PLAN.md §0's Hostinger basic auth can stay on top of this or be dropped once
 * this is verified live; they are independent layers.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.SESSION_SECRET;
  // A missing secret must fail closed. Failing open would silently unlock the
  // whole app the first time someone forgets an env var on a redeploy.
  if (!secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, secret)) return NextResponse.next();

  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except:
   *   /login          — the way back in
   *   /api/cron/*     — Hostinger's cron authenticates with its own shared
   *                     secret header (PR-14); it has no cookie and never will
   *   /_next, favicon — static assets, which never carry a session
   */
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
