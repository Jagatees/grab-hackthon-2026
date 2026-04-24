import { SyncSpotRoom } from "@/components/syncspot-room";

type Params = Promise<{
  roomId: string;
}>;

export default async function RoomPage({ params }: { params: Params }) {
  const { roomId } = await params;

  return <SyncSpotRoom roomId={roomId} />;
}

