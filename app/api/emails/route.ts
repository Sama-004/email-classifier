import { db } from "@/db";
import { emails } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
  const storedEmails = await db.select().from(emails);
  return NextResponse.json(storedEmails);
}
