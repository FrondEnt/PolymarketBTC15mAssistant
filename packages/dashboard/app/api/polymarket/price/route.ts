import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tokenId = searchParams.get("token_id");
  const side = searchParams.get("side");

  if (!tokenId || !side) {
    return NextResponse.json(
      { error: "token_id and side are required" },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://clob.polymarket.com/price");
    url.searchParams.set("token_id", tokenId);
    url.searchParams.set("side", side);

    const response = await fetch(url.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: `CLOB API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5",
      },
    });
  } catch (error) {
    console.error("Error fetching CLOB price:", error);
    return NextResponse.json(
      { error: "Failed to fetch CLOB price" },
      { status: 500 }
    );
  }
}
