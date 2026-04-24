import { randomUUID } from "node:crypto";
import {
  getRoomSnapshot,
  readSyncSpotDb,
  recalculateRoomStatus,
  updateSyncSpotDb
} from "@/lib/syncspot/store";
import type {
  RankingMode,
  SyncSpotParticipant,
  SyncSpotRecommendation,
  SyncSpotRoom,
  TravelProfile
} from "@/lib/syncspot/types";
import {
  getGrabDirection,
  nearbyGrabPlaces,
  searchGrabPlaces,
  type GrabPlace
} from "@/lib/syncspot/grab-client";

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function dedupePlaces(places: GrabPlace[]) {
  const seen = new Set<string>();
  const result: GrabPlace[] = [];

  for (const place of places) {
    const key =
      place.poi_id ??
      place.id ??
      `${place.name ?? "unknown"}:${place.location?.latitude ?? 0}:${
        place.location?.longitude ?? 0
      }`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(place);
  }

  return result;
}

function deriveCenter(participants: SyncSpotParticipant[]) {
  const confirmed = participants.filter(
    (participant) =>
      participant.confirmed &&
      participant.originLat !== null &&
      participant.originLng !== null
  );

  const latitude =
    confirmed.reduce((sum, participant) => sum + (participant.originLat ?? 0), 0) /
    confirmed.length;
  const longitude =
    confirmed.reduce((sum, participant) => sum + (participant.originLng ?? 0), 0) /
    confirmed.length;

  return {
    latitude,
    longitude
  };
}

function spreadDuration(durations: number[]) {
  return Math.max(...durations) - Math.min(...durations);
}

function averageDuration(durations: number[]) {
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}

function midpointDistanceScore(
  candidate: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number }
) {
  const latDiff = candidate.latitude - center.latitude;
  const lngDiff = candidate.longitude - center.longitude;

  return Math.sqrt(latDiff ** 2 + lngDiff ** 2) * 1_000_000;
}

function scoreCandidate(
  durations: number[],
  mode: RankingMode,
  candidate: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number }
) {
  const maxTravelTime = Math.max(...durations);
  const minTravelTime = Math.min(...durations);
  const totalTravelTime = durations.reduce((sum, duration) => sum + duration, 0);
  const spread = spreadDuration(durations);
  const averageTravelTime = averageDuration(durations);
  const midpointScore = midpointDistanceScore(candidate, center);
  const fairnessScore =
    mode === "fastest"
      ? 0.7 * totalTravelTime + 0.2 * maxTravelTime + 0.1 * spread
      : mode === "midpoint"
        ? midpointScore + 0.1 * maxTravelTime + 0.05 * spread
        : 0.5 * maxTravelTime +
          0.25 * spread +
          0.15 * averageTravelTime +
          0.1 * totalTravelTime;

  return {
    fairnessScore,
    maxTravelTime,
    minTravelTime,
    totalTravelTime,
    averageTravelTime,
    spread
  };
}

function pickBadge(
  room: SyncSpotRoom,
  recommendation: {
    maxTravelTime: number;
    spread: number;
    totalTravelTime: number;
    perUserTravelTimes: SyncSpotRecommendation["perUserTravelTimes"];
  },
  allCandidates: Array<{
    totalTravelTime: number;
    spread: number;
  }>
): SyncSpotRecommendation["badge"] {
  const hostTravelTime =
    recommendation.perUserTravelTimes.find(
      (item) => item.participantId === room.hostId
    )?.duration ?? null;

  const others = recommendation.perUserTravelTimes
    .filter((item) => item.participantId !== room.hostId)
    .map((item) => item.duration);

  if (
    hostTravelTime !== null &&
    others.length > 0 &&
    hostTravelTime + 8 * 60 < averageDuration(others)
  ) {
    return "Host-friendly";
  }

  const fastestTotal = Math.min(...allCandidates.map((item) => item.totalTravelTime));

  if (recommendation.totalTravelTime === fastestTotal) {
    return "Fastest";
  }

  if (recommendation.spread >= 12 * 60) {
    return "One-sided";
  }

  return "Balanced";
}

function buildExplanation(recommendation: {
  maxTravelTime: number;
  spread: number;
  totalTravelTime: number;
  perUserTravelTimes: SyncSpotRecommendation["perUserTravelTimes"];
  badge: SyncSpotRecommendation["badge"];
}) {
  const underThreshold = recommendation.maxTravelTime <= 25 * 60;

  if (underThreshold) {
    return `Everyone stays under ${Math.round(recommendation.maxTravelTime / 60)} min.`;
  }

  if (recommendation.spread <= 6 * 60) {
    return "Travel times are well balanced across the group.";
  }

  if (recommendation.badge === "Fastest") {
    return "Fastest overall, but it slightly favors one side.";
  }

  if (recommendation.badge === "Host-friendly") {
    return "Convenient for the host, but the compromise leans their way.";
  }

  if (recommendation.badge === "One-sided") {
    return "Convenient for most, but less fair to one participant.";
  }

  return `Solid compromise with a group total of ${Math.round(
    recommendation.totalTravelTime / 60
  )} min.`;
}

export async function createRoom(input: { hostName: string; category?: string }) {
  return updateSyncSpotDb(async (db) => {
    const now = new Date().toISOString();
    const roomId = randomUUID();
    const hostId = randomUUID();
    const room: SyncSpotRoom = {
      roomId,
      roomCode: createRoomCode(),
      hostId,
      category: input.category?.trim() || "cafe",
      rankingMode: "fairest",
      selectedVenueId: null,
      status: "waiting",
      createdAt: now,
      updatedAt: now
    };
    const hostParticipant: SyncSpotParticipant = {
      participantId: hostId,
      roomId,
      name: input.hostName.trim(),
      originLat: null,
      originLng: null,
      originLabel: null,
      travelProfile: "driving",
      avoid: [],
      votedVenueIds: [],
      confirmed: false,
      joinedAt: now,
      updatedAt: now
    };

    db.rooms.push(room);
    db.participants.push(hostParticipant);

    return {
      room,
      participant: hostParticipant,
      shareLink: `/room/${room.roomId}`,
      roomCode: room.roomCode
    };
  });
}

export async function joinRoom(input: {
  roomCode?: string;
  roomId?: string;
  name: string;
}) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) =>
      input.roomId
        ? candidate.roomId === input.roomId
        : candidate.roomCode === input.roomCode?.trim().toUpperCase()
    );

    if (!room) {
      throw new Error("Room not found.");
    }

    const participant: SyncSpotParticipant = {
      participantId: randomUUID(),
      roomId: room.roomId,
      name: input.name.trim(),
      originLat: null,
      originLng: null,
      originLabel: null,
      travelProfile: "driving",
      avoid: [],
      votedVenueIds: [],
      confirmed: false,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.participants.push(participant);
    room.updatedAt = new Date().toISOString();

    return {
      room,
      participant
    };
  });
}

export async function getRoomSnapshotById(roomId: string) {
  const db = await readSyncSpotDb();
  const room = db.rooms.find((candidate) => candidate.roomId === roomId);

  if (!room) {
    throw new Error("Room not found.");
  }

  return getRoomSnapshot(db, room);
}

export async function updateRoom(
  roomId: string,
  input: {
    category?: string;
    rankingMode?: RankingMode;
    status?: SyncSpotRoom["status"];
    selectedVenueId?: string | null;
  }
) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === roomId);

    if (!room) {
      throw new Error("Room not found.");
    }

    if (input.category) {
      room.category = input.category.trim();
    }

    if (input.rankingMode) {
      room.rankingMode = input.rankingMode;
    }

    if (input.status) {
      room.status = input.status;
    }

    if (input.selectedVenueId !== undefined) {
      room.selectedVenueId = input.selectedVenueId;
    }

    room.updatedAt = new Date().toISOString();

    return getRoomSnapshot(db, room);
  });
}

export async function updateParticipant(
  roomId: string,
  participantId: string,
  input: {
    name?: string;
    originLat?: number | null;
    originLng?: number | null;
    originLabel?: string | null;
    travelProfile?: TravelProfile;
    avoid?: string[];
    votedVenueIds?: string[];
    confirmed?: boolean;
  }
) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === roomId);
    const participant = db.participants.find(
      (candidate) =>
        candidate.roomId === roomId && candidate.participantId === participantId
    );

    if (!room || !participant) {
      throw new Error("Participant not found.");
    }

    if (input.name !== undefined) {
      participant.name = input.name.trim();
    }

    if (input.originLat !== undefined) {
      participant.originLat = input.originLat;
    }

    if (input.originLng !== undefined) {
      participant.originLng = input.originLng;
    }

    if (input.originLabel !== undefined) {
      participant.originLabel = input.originLabel;
    }

    if (input.travelProfile !== undefined) {
      participant.travelProfile = input.travelProfile;
    }

    if (input.avoid !== undefined) {
      participant.avoid = input.avoid;
    }

    if (input.votedVenueIds !== undefined) {
      participant.votedVenueIds = input.votedVenueIds;
    }

    if (input.confirmed !== undefined) {
      participant.confirmed = input.confirmed;
    }

    participant.updatedAt = new Date().toISOString();

    const roomParticipants = db.participants.filter(
      (candidate) => candidate.roomId === roomId
    );
    const roomRecommendations = db.recommendations.filter(
      (candidate) => candidate.roomId === roomId
    );

    recalculateRoomStatus(room, roomParticipants, roomRecommendations);

    return getRoomSnapshot(db, room);
  });
}

export async function computeRecommendations(
  roomId: string,
  input?: {
    category?: string;
    country?: string;
    candidateLimit?: number;
    rankingMode?: RankingMode;
    profile?: string;
    avoid?: string[];
  }
) {
  const db = await readSyncSpotDb();
  const room = db.rooms.find((candidate) => candidate.roomId === roomId);

  if (!room) {
    throw new Error("Room not found.");
  }

  const participants = db.participants.filter(
    (candidate) =>
      candidate.roomId === roomId &&
      candidate.confirmed &&
      candidate.originLat !== null &&
      candidate.originLng !== null
  );

  if (participants.length < 2) {
    throw new Error("At least two confirmed participants are required.");
  }

  const category = input?.category?.trim() || room.category || "cafe";
  const rankingMode = input?.rankingMode ?? room.rankingMode ?? "fairest";
  const center = deriveCenter(participants);
  const location = `${center.latitude.toFixed(6)},${center.longitude.toFixed(6)}`;
  const candidateLimit = Math.min(Math.max(input?.candidateLimit ?? 6, 1), 10);

  const [keywordOutcome, nearbyOutcome] = await Promise.allSettled([
    searchGrabPlaces({
      keyword: category,
      country: input?.country ?? "SGP",
      location,
      limit: candidateLimit * 2
    }),
    nearbyGrabPlaces({
      location,
      radius: 3,
      limit: candidateLimit * 2,
      rankBy: "distance"
    })
  ]);

  const keywordResults =
    keywordOutcome.status === "fulfilled" ? keywordOutcome.value : [];
  const nearbyResults =
    nearbyOutcome.status === "fulfilled" ? nearbyOutcome.value : [];

  if (
    keywordOutcome.status === "rejected" &&
    nearbyOutcome.status === "rejected"
  ) {
    throw new Error(
      `Grab search is temporarily unavailable. ${keywordOutcome.reason instanceof Error ? keywordOutcome.reason.message : "Keyword search failed."}`
    );
  }

  const candidates = dedupePlaces([...keywordResults, ...nearbyResults])
    .filter((place) => place.location?.latitude && place.location?.longitude)
    .slice(0, candidateLimit);

  if (candidates.length === 0) {
    throw new Error("No candidate meetup places found.");
  }

  const scoredRecommendations: SyncSpotRecommendation[] = [];

  for (const candidate of candidates) {
    if (!candidate.location) {
      continue;
    }

    const perUserTravelTimes: SyncSpotRecommendation["perUserTravelTimes"] = [];

    for (const participant of participants) {
      let result;

      try {
        result = await getGrabDirection({
          coordinates: [
            [participant.originLng ?? 0, participant.originLat ?? 0],
            [candidate.location.longitude, candidate.location.latitude]
          ],
          profile: participant.travelProfile ?? input?.profile ?? "driving",
          overview: "full",
          avoid: participant.avoid?.length ? participant.avoid : input?.avoid ?? []
        });
      } catch {
        perUserTravelTimes.length = 0;
        break;
      }

      if (!result.route?.duration || result.route.distance === undefined) {
        continue;
      }

      perUserTravelTimes.push({
        participantId: participant.participantId,
        name: participant.name,
        profile: participant.travelProfile ?? "driving",
        duration: result.route.duration,
        distance: result.route.distance,
        geometry: result.route.geometry ?? null
      });
    }

    if (perUserTravelTimes.length !== participants.length) {
      continue;
    }

    const summary = scoreCandidate(
      perUserTravelTimes.map((item) => item.duration),
      rankingMode,
      candidate.location,
      center
    );

    scoredRecommendations.push({
      roomId,
      poiId: candidate.poi_id ?? candidate.id ?? randomUUID(),
      name: candidate.name ?? "Unnamed place",
      lat: candidate.location.latitude,
      lng: candidate.location.longitude,
      address: candidate.formatted_address ?? null,
      fairnessScore: Number(summary.fairnessScore.toFixed(2)),
      maxTravelTime: summary.maxTravelTime,
      minTravelTime: summary.minTravelTime,
      totalTravelTime: summary.totalTravelTime,
      averageTravelTime: summary.averageTravelTime,
      spread: summary.spread,
      perUserTravelTimes,
      rank: 0,
      rankingMode,
      badge: "Balanced",
      explanation: "",
      voteCount: 0,
      category: candidate.category ?? null,
      businessType: candidate.business_type ?? null,
      computedAt: new Date().toISOString()
    });
  }

  const ranked = scoredRecommendations
    .sort((a, b) => a.fairnessScore - b.fairnessScore)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1
    }))
    .slice(0, 3);

  if (ranked.length === 0) {
    throw new Error(
      "Grab routing could not score meetup places right now. Please try again in a moment."
    );
  }

  return updateSyncSpotDb(async (latestDb) => {
    const latestRoom = latestDb.rooms.find((candidate) => candidate.roomId === roomId);

    if (!latestRoom) {
      throw new Error("Room not found.");
    }

    latestRoom.category = category;
    latestRoom.rankingMode = rankingMode;
    latestRoom.selectedVenueId = null;

    const rankedWithMetadata = ranked.map((recommendation) => {
      const badge = pickBadge(latestRoom, recommendation, ranked);

      return {
        ...recommendation,
        badge,
        explanation: buildExplanation({
          ...recommendation,
          badge
        })
      };
    });

    latestDb.recommendations = latestDb.recommendations.filter(
      (candidate) => candidate.roomId !== roomId
    );
    latestDb.recommendations.push(...rankedWithMetadata);

    latestDb.participants = latestDb.participants.map((participant) =>
      participant.roomId === roomId
        ? {
            ...participant,
            votedVenueIds: []
          }
        : participant
    );

    const latestParticipants = latestDb.participants.filter(
      (candidate) => candidate.roomId === roomId
    );

    recalculateRoomStatus(latestRoom, latestParticipants, rankedWithMetadata);

    return getRoomSnapshot(latestDb, latestRoom);
  });
}

export async function toggleVenueVote(input: {
  roomId: string;
  participantId: string;
  venueId: string;
}) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === input.roomId);
    const participant = db.participants.find(
      (candidate) =>
        candidate.roomId === input.roomId &&
        candidate.participantId === input.participantId
    );
    const venue = db.recommendations.find(
      (candidate) =>
        candidate.roomId === input.roomId && candidate.poiId === input.venueId
    );

    if (!room || !participant || !venue) {
      throw new Error("Unable to record vote.");
    }

    if (room.status === "finalized") {
      throw new Error("Room is already finalized.");
    }

    const currentVotes = new Set(participant.votedVenueIds ?? []);

    if (currentVotes.has(input.venueId)) {
      currentVotes.delete(input.venueId);
    } else {
      currentVotes.add(input.venueId);
    }

    participant.votedVenueIds = Array.from(currentVotes);
    participant.updatedAt = new Date().toISOString();
    room.updatedAt = new Date().toISOString();

    return getRoomSnapshot(db, room);
  });
}

export async function finalizeVenue(input: {
  roomId: string;
  participantId: string;
  venueId: string;
}) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === input.roomId);
    const venue = db.recommendations.find(
      (candidate) =>
        candidate.roomId === input.roomId && candidate.poiId === input.venueId
    );

    if (!room || !venue) {
      throw new Error("Unable to finalize venue.");
    }

    if (room.hostId !== input.participantId) {
      throw new Error("Only the host can finalize the venue.");
    }

    room.selectedVenueId = input.venueId;
    room.status = "finalized";
    room.updatedAt = new Date().toISOString();

    const participants = db.participants.filter(
      (candidate) => candidate.roomId === input.roomId
    );
    const recommendations = db.recommendations.filter(
      (candidate) => candidate.roomId === input.roomId
    );

    recalculateRoomStatus(room, participants, recommendations);

    return getRoomSnapshot(db, room);
  });
}

export async function reopenVenue(input: {
  roomId: string;
  participantId: string;
}) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === input.roomId);

    if (!room) {
      throw new Error("Unable to reopen room.");
    }

    if (room.hostId !== input.participantId) {
      throw new Error("Only the host can reopen the room.");
    }

    room.selectedVenueId = null;
    room.updatedAt = new Date().toISOString();

    const participants = db.participants.filter(
      (candidate) => candidate.roomId === input.roomId
    );
    const recommendations = db.recommendations.filter(
      (candidate) => candidate.roomId === input.roomId
    );

    recalculateRoomStatus(room, participants, recommendations);

    return getRoomSnapshot(db, room);
  });
}

export async function sendRoomMessage(input: {
  roomId: string;
  participantId: string;
  body: string;
}) {
  return updateSyncSpotDb(async (db) => {
    const room = db.rooms.find((candidate) => candidate.roomId === input.roomId);
    const participant = db.participants.find(
      (candidate) =>
        candidate.roomId === input.roomId &&
        candidate.participantId === input.participantId
    );

    if (!room || !participant) {
      throw new Error("Unable to send message.");
    }

    const trimmedBody = input.body.trim();

    if (!trimmedBody) {
      throw new Error("Message cannot be empty.");
    }

    db.messages.push({
      messageId: randomUUID(),
      roomId: input.roomId,
      participantId: input.participantId,
      participantName: participant.name,
      body: trimmedBody,
      createdAt: new Date().toISOString()
    });

    room.updatedAt = new Date().toISOString();

    return getRoomSnapshot(db, room);
  });
}
