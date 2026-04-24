import { NextRequest } from "next/server";
import {
  computeRecommendations,
  getRoomSnapshotById
} from "@/lib/syncspot/service";
import type { RankingMode } from "@/lib/syncspot/types";

type Params = Promise<{
  roomId: string;
}>;

export async function GET(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { roomId } = await params;
    const snapshot = await getRoomSnapshotById(roomId);

    return Response.json(snapshot.recommendations);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load recommendations."
      },
      { status: 404 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { roomId } = await params;
    const body = (await request.json()) as {
      category?: string;
      selectedArea?: string | null;
      customQuery?: string | null;
      country?: string;
      candidateLimit?: number;
      rankingMode?: RankingMode;
      profile?: string;
      avoid?: string[];
    };
    const snapshot = await computeRecommendations(roomId, body);

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to compute recommendations."
      },
      { status: 500 }
    );
  }
}
