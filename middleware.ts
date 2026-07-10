import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  isConsumedMockRecoveryToken,
  isValidMockRecoveryToken,
  MOCK_RECOVERY_CONSUMED_COOKIE,
  MOCK_RECOVERY_COOKIE,
} from "@/lib/auth/mock-recovery";
import { getSupabasePublicConfig, validateSupabaseConfig } from "@/lib/supabase/config";

const protectedRoutes = ["/today", "/transactions", "/upload", "/debts", "/overview", "/settings"];
const RESET_PASSWORD_PATH = "/auth/reset";

function isProtected(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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
      const consumedTokens = request.cookies.get(MOCK_RECOVERY_CONSUMED_COOKIE)?.value;
      if (isValidMockRecoveryToken(token) && !isConsumedMockRecoveryToken(token, consumedTokens)) {
        request.cookies.set(MOCK_RECOVERY_COOKIE, token);
        const response = NextResponse.next({ request });
        response.cookies.set(MOCK_RECOVERY_COOKIE, token, { path: "/", sameSite: "lax" });
        return response;
      }
      if (token) {
        request.cookies.delete(MOCK_RECOVERY_COOKIE);
        const response = NextResponse.next({ request });
        response.cookies.delete(MOCK_RECOVERY_COOKIE);
        return response;
      }
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  const configStatus = validateSupabaseConfig();
  if (!configStatus.ok) {
    if (isProtected(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabaseConfig = getSupabasePublicConfig();
  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.publicKey,
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
