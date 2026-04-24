import { NextRequest } from "next/server";
import { reopenVenue } from "@/lib/syncspot/service";

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
    };

    if (!body.participantId) {
      return Response.json(
        {
          error: "participantId is required."
        },
        { status: 400 }
      );
    }

    const snapshot = await reopenVenue({
      roomId,
      participantId: body.participantId
    });

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to reopen room."
      },
      { status: 500 }
    );
  }
}
