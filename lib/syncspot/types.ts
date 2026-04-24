export type RoomStatus = "waiting" | "ready" | "computed" | "finalized";

export type RankingMode = "fairest" | "fastest" | "midpoint";

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
  selectedArea: string | null;
  customQuery: string | null;
  rankingMode: RankingMode;
  selectedVenueId: string | null;
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
  votedVenueIds?: string[];
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
  averageTravelTime: number;
  spread: number;
  perUserTravelTimes: Array<{
    participantId: string;
    name: string;
    profile: TravelProfile;
    duration: number;
    distance: number;
    geometry: string | null;
  }>;
  rank: number;
  rankingMode: RankingMode;
  badge: "Balanced" | "Fastest" | "One-sided" | "Host-friendly";
  explanation: string;
  voteCount: number;
  category: string | null;
  businessType: string | null;
  computedAt: string;
};

export type SyncSpotMessage = {
  messageId: string;
  roomId: string;
  participantId: string;
  participantName: string;
  body: string;
  createdAt: string;
};

export type SyncSpotDb = {
  rooms: SyncSpotRoom[];
  participants: SyncSpotParticipant[];
  recommendations: SyncSpotRecommendation[];
  messages: SyncSpotMessage[];
};

export type SyncSpotRoomSnapshot = {
  room: SyncSpotRoom;
  participants: SyncSpotParticipant[];
  recommendations: SyncSpotRecommendation[];
  messages: SyncSpotMessage[];
};
