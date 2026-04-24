import { NextRequest } from "next/server";
import { createRoom } from "@/lib/syncspot/service";
import type { RankingMode } from "@/lib/syncspot/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      hostName?: string;
      category?: string;
      selectedArea?: string | null;
      customQuery?: string | null;
      rankingMode?: RankingMode;
    };

    if (!body.hostName?.trim()) {
      return Response.json(
        {
          error: "hostName is required."
        },
        { status: 400 }
      );
    }

    const result = await createRoom(body as {
      hostName: string;
      category?: string;
      selectedArea?: string | null;
      customQuery?: string | null;
      rankingMode?: RankingMode;
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to create room."
      },
      { status: 500 }
    );
  }
}
