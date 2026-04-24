import { NextRequest } from "next/server";
import { toggleVenueVote } from "@/lib/syncspot/service";

type Params = Promise<{
  roomId: string;
}>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { roomId } = await params;
    const body = (await request.json()) as {
      participantId?: string;
      venueId?: string;
    };

    if (!body.participantId || !body.venueId) {
      return Response.json(
        {
          error: "participantId and venueId are required."
        },
        { status: 400 }
      );
    }

    const snapshot = await toggleVenueVote({
      roomId,
      participantId: body.participantId,
      venueId: body.venueId
    });

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to record vote."
      },
      { status: 500 }
    );
  }
}
