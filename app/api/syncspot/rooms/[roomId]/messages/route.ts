import { NextRequest } from "next/server";
import { getRoomSnapshotById, sendRoomMessage } from "@/lib/syncspot/service";

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

    return Response.json(snapshot.messages);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load messages."
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
      participantId?: string;
      body?: string;
    };

    if (!body.participantId || !body.body) {
      return Response.json(
        {
          error: "participantId and body are required."
        },
        { status: 400 }
      );
    }

    const snapshot = await sendRoomMessage({
      roomId,
      participantId: body.participantId,
      body: body.body
    });

    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to send message."
      },
      { status: 500 }
    );
  }
}
