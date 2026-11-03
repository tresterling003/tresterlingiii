import { NextResponse, type NextRequest } from "next/server";

const APP = ["/home", "/matchup", "/league", "/activity", "/profile", "/onboarding"];
const AUTH = ["/sign-in", "/sign-up"];

/** Cheap cookie-presence routing. Real session validation happens in every API call. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("rival_session")?.value);
  if (!hasSession && APP.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === "/" || AUTH.includes(pathname)) && !req.nextUrl.searchParams.has("next")) {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in", "/sign-up", "/home/:path*", "/matchup/:path*", "/league/:path*", "/activity/:path*", "/profile/:path*", "/onboarding/:path*"],
};
