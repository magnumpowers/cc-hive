import { NextResponse } from "next/server";
import { discoverProjects } from "@/lib/claude";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = discoverProjects();
  return NextResponse.json(projects);
}
