import { NextResponse, type NextRequest } from "next/server";

const APP = ["/home", "/list", "/family", "/gifts", "/more", "/finder", "/budget", "/games", "/settings"];
const AUTH = ["/sign-in", "/sign-up"];

/** Cookie-presence routing only. Every API call validates the session for real. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const has = Boolean(req.cookies.get("hq_session")?.value);
  if (!has && APP.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (has && (pathname === "/" || AUTH.includes(pathname)) && !req.nextUrl.searchParams.has("next") && !req.nextUrl.searchParams.has("code")) {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in", "/sign-up", "/home/:path*", "/list/:path*", "/family/:path*", "/gifts/:path*", "/more/:path*", "/finder/:path*", "/budget/:path*", "/games/:path*", "/settings/:path*"],
};
