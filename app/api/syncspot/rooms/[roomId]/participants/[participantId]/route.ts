import { NextRequest } from "next/server";
import { updateParticipant } from "@/lib/syncspot/service";

type Params = Promise<{
  roomId: string;
  participantId: string;
}>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { roomId, participantId } = await params;
    const body = (await request.json()) as {
      name?: string;
      originLat?: number | null;
      originLng?: number | null;
      originLabel?: string | null;
      travelProfile?: "driving" | "motorcycle" | "tricycle" | "cycling" | "walking";
      avoid?: string[];
      confirmed?: boolean;
    };
    const snapshot = await updateParticipant(roomId, participantId, body);

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update participant."
      },
      { status: 500 }
    );
  }
}
