import { NextRequest } from "next/server";
import { getRoomSnapshotById, updateRoom } from "@/lib/syncspot/service";

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

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load room."
      },
      { status: 404 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { roomId } = await params;
    const body = (await request.json()) as {
      category?: string;
      status?: "waiting" | "ready" | "computed";
    };
    const snapshot = await updateRoom(roomId, body);

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to update room."
      },
      { status: 500 }
    );
  }
}

