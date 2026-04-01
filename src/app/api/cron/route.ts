import { NextResponse } from "next/server";
import { discoverCronJobs } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = discoverCronJobs();
  return NextResponse.json(jobs);
}
