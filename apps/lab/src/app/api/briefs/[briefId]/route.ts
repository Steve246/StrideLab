import { NextRequest, NextResponse } from "next/server";
import { readBriefFile } from "@/lib/weeklyBrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ briefId: string }> };

/** Download a generated weekly brief (md | html). */
export async function GET(req: NextRequest, { params }: Params) {
  const { briefId } = await params;
  const formatRaw = req.nextUrl.searchParams.get("format")?.toLowerCase();
  const format = formatRaw === "html" ? "html" : "md";

  const file = await readBriefFile(briefId, format);
  if (!file) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  return new NextResponse(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
