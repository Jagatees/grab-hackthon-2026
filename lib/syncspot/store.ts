import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  RankingMode,
  SyncSpotDb,
  SyncSpotMessage,
  SyncSpotParticipant,
  SyncSpotRecommendation,
  SyncSpotRoom,
  SyncSpotRoomSnapshot,
  TravelProfile
} from "@/lib/syncspot/types";

const DB_PATH = path.join(process.cwd(), "data", "syncspot-db.json");
const EMPTY_DB: SyncSpotDb = {
  rooms: [],
  participants: [],
  recommendations: [],
  messages: []
};

let writeQueue = Promise.resolve();

function normalizeRoom(room: SyncSpotRoom): SyncSpotRoom {
  return {
    ...room,
    selectedArea: room.selectedArea ?? null,
    customQuery: room.customQuery ?? null,
    rankingMode: (room.rankingMode ?? "fairest") as RankingMode,
    selectedVenueId: room.selectedVenueId ?? null,
    status:
      room.selectedVenueId && room.status !== "finalized"
        ? "finalized"
        : room.status ?? "waiting"
  };
}

function normalizeParticipant(participant: SyncSpotParticipant): SyncSpotParticipant {
  const profile = (participant.travelProfile ?? "driving") as TravelProfile;

  return {
    ...participant,
    travelProfile: profile,
    avoid: participant.avoid ?? [],
    votedVenueIds: participant.votedVenueIds ?? []
  };
}

function normalizeRecommendation(
  recommendation: SyncSpotRecommendation
): SyncSpotRecommendation {
  const durations = recommendation.perUserTravelTimes.map((item) => item.duration);
  const averageTravelTime =
    recommendation.averageTravelTime ??
    (durations.length
      ? durations.reduce((sum, item) => sum + item, 0) / durations.length
      : 0);
  const spread =
    recommendation.spread ??
    (durations.length
      ? Math.max(...durations) - Math.min(...durations)
      : 0);

  return {
    ...recommendation,
    averageTravelTime,
    spread,
    rankingMode: (recommendation.rankingMode ?? "fairest") as RankingMode,
    badge: recommendation.badge ?? "Balanced",
    explanation: recommendation.explanation ?? "",
    voteCount: recommendation.voteCount ?? 0
  };
}

function normalizeMessage(message: SyncSpotMessage): SyncSpotMessage {
  return message;
}

async function ensureDbFile() {
  await mkdir(path.dirname(DB_PATH), { recursive: true });

  try {
    await readFile(DB_PATH, "utf8");
  } catch {
    await writeFile(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

export async function readSyncSpotDb(): Promise<SyncSpotDb> {
  await ensureDbFile();

  try {
    const raw = await readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as SyncSpotDb;

    return {
      ...parsed,
      rooms: (parsed.rooms ?? []).map(normalizeRoom),
      participants: (parsed.participants ?? []).map(normalizeParticipant),
      recommendations: (parsed.recommendations ?? []).map(normalizeRecommendation),
      messages: (parsed.messages ?? []).map(normalizeMessage)
    };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

async function writeSyncSpotDb(db: SyncSpotDb) {
  await ensureDbFile();
  await writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

export async function updateSyncSpotDb<T>(
  updater: (db: SyncSpotDb) => Promise<T> | T
): Promise<T> {
  const task = writeQueue.then(async () => {
    const db = await readSyncSpotDb();
    const result = await updater(db);
    await writeSyncSpotDb(db);
    return result;
  });

  writeQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

export function getRoomSnapshot(
  db: SyncSpotDb,
  room: SyncSpotRoom
): SyncSpotRoomSnapshot {
  const participants = db.participants
    .filter((participant) => participant.roomId === room.roomId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const voteCounts = participants.reduce<Record<string, number>>((accumulator, participant) => {
    for (const venueId of participant.votedVenueIds ?? []) {
      accumulator[venueId] = (accumulator[venueId] ?? 0) + 1;
    }

    return accumulator;
  }, {});

  const recommendations = db.recommendations
    .filter((recommendation) => recommendation.roomId === room.roomId)
    .map((recommendation) => ({
      ...recommendation,
      voteCount: voteCounts[recommendation.poiId] ?? 0
    }))
    .sort((a, b) => a.rank - b.rank);
  const messages = db.messages
    .filter((message) => message.roomId === room.roomId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    room,
    participants,
    recommendations,
    messages
  };
}

export function recalculateRoomStatus(
  room: SyncSpotRoom,
  participants: SyncSpotParticipant[],
  recommendations: SyncSpotRecommendation[]
) {
  const confirmedCount = participants.filter((participant) => participant.confirmed).length;

  room.status =
    room.selectedVenueId
      ? "finalized"
      : recommendations.length > 0
      ? "computed"
      : confirmedCount >= 2
        ? "ready"
        : "waiting";
  room.updatedAt = new Date().toISOString();
}
