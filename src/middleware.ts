import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function middleware(req: NextRequest) {
  // Only allow requests from localhost
  const host = req.headers.get("host")?.split(":")[0] || "";
  if (!ALLOWED_HOSTS.has(host)) {
    return NextResponse.json(
      { error: "Hive only accepts connections from localhost" },
      { status: 403 }
    );
  }

  // For mutation endpoints, validate Origin header (CSRF protection)
  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        const url = new URL(origin);
        if (!ALLOWED_HOSTS.has(url.hostname)) {
          return NextResponse.json(
            { error: "Cross-origin requests are not allowed" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid origin" },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
