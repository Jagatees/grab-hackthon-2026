import { NextRequest } from "next/server";
import { joinRoom } from "@/lib/syncspot/service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      roomCode?: string;
      roomId?: string;
      name?: string;
    };

    if ((!body.roomCode?.trim() && !body.roomId?.trim()) || !body.name?.trim()) {
      return Response.json(
        {
          error: "roomCode or roomId and name are required."
        },
        { status: 400 }
      );
    }

    const result = await joinRoom({
      roomCode: body.roomCode,
      roomId: body.roomId,
      name: body.name
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to join room."
      },
      { status: 500 }
    );
  }
}
