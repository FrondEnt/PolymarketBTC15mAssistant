import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const seriesId = searchParams.get("series_id");
  const active = searchParams.get("active") || "true";
  const closed = searchParams.get("closed") || "false";
  const limit = searchParams.get("limit") || "25";

  if (!seriesId) {
    return NextResponse.json(
      { error: "series_id is required" },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("active", active);
    url.searchParams.set("closed", closed);
    url.searchParams.set("limit", limit);

    const response = await fetch(url.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: `Polymarket API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (error) {
    console.error("Error fetching Polymarket events:", error);
    return NextResponse.json(
      { error: "Failed to fetch Polymarket data" },
      { status: 500 }
    );
  }
}
