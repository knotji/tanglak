import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

const protectedRoutes = ["/today", "/transactions", "/upload", "/debts", "/overview", "/settings"];
const RESET_PASSWORD_PATH = "/auth/reset";

function isProtected(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function middleware(request: NextRequest) {
  if (process.env["E2E_MOCK_AUTH"] === "1") {
    const mockUser = request.cookies.get("tl_mock_user")?.value;
    if (isProtected(request.nextUrl.pathname) && !mockUser) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
    if (request.nextUrl.pathname === "/auth" && mockUser) {
      return NextResponse.redirect(new URL("/today", request.url));
    }
    if (request.nextUrl.pathname === RESET_PASSWORD_PATH) {
      const token = request.nextUrl.searchParams.get("token");
      if (token === "valid-mock-recovery") {
        request.cookies.set("tl_mock_recovery", "1");
        const response = NextResponse.next({ request });
        response.cookies.set("tl_mock_recovery", "1", { path: "/", sameSite: "lax" });
        return response;
      }
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  if (!hasSupabaseConfig()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (request.nextUrl.pathname === RESET_PASSWORD_PATH) {
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
    const code = request.nextUrl.searchParams.get("code");

    if (tokenHash && type) {
      await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }

    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected(request.nextUrl.pathname) && !user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (request.nextUrl.pathname === "/auth" && user) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
