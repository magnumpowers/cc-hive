import { NextRequest, NextResponse } from "next/server";
import { getAliases, setAlias } from "@/lib/aliases";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { path, displayName } = await req.json();

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  if (typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }

  setAlias(path, displayName.trim() || null);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(getAliases());
}
