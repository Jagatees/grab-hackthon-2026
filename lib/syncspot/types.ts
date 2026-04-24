export type RoomStatus = "waiting" | "ready" | "computed";

export type TravelProfile =
  | "driving"
  | "motorcycle"
  | "tricycle"
  | "cycling"
  | "walking";

export type SyncSpotRoom = {
  roomId: string;
  roomCode: string;
  hostId: string;
  category: string;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
};

export type SyncSpotParticipant = {
  participantId: string;
  roomId: string;
  name: string;
  originLat: number | null;
  originLng: number | null;
  originLabel: string | null;
  travelProfile?: TravelProfile;
  avoid?: string[];
  confirmed: boolean;
  joinedAt: string;
  updatedAt: string;
};

export type SyncSpotRecommendation = {
  roomId: string;
  poiId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  fairnessScore: number;
  maxTravelTime: number;
  minTravelTime: number;
  totalTravelTime: number;
  perUserTravelTimes: Array<{
    participantId: string;
    name: string;
    profile: TravelProfile;
    duration: number;
    distance: number;
    geometry: string | null;
  }>;
  rank: number;
  category: string | null;
  businessType: string | null;
  computedAt: string;
};

export type SyncSpotDb = {
  rooms: SyncSpotRoom[];
  participants: SyncSpotParticipant[];
  recommendations: SyncSpotRecommendation[];
};

export type SyncSpotRoomSnapshot = {
  room: SyncSpotRoom;
  participants: SyncSpotParticipant[];
  recommendations: SyncSpotRecommendation[];
};
