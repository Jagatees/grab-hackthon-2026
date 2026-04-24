import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  SyncSpotDb,
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
  recommendations: []
};

let writeQueue = Promise.resolve();

function normalizeParticipant(participant: SyncSpotParticipant): SyncSpotParticipant {
  const profile = (participant.travelProfile ?? "driving") as TravelProfile;

  return {
    ...participant,
    travelProfile: profile,
    avoid: participant.avoid ?? []
  };
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
      participants: (parsed.participants ?? []).map(normalizeParticipant)
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
  const recommendations = db.recommendations
    .filter((recommendation) => recommendation.roomId === room.roomId)
    .sort((a, b) => a.rank - b.rank);

  return {
    room,
    participants,
    recommendations
  };
}

export function recalculateRoomStatus(
  room: SyncSpotRoom,
  participants: SyncSpotParticipant[],
  recommendations: SyncSpotRecommendation[]
) {
  const confirmedCount = participants.filter((participant) => participant.confirmed).length;

  room.status =
    recommendations.length > 0
      ? "computed"
      : confirmedCount >= 2
        ? "ready"
        : "waiting";
  room.updatedAt = new Date().toISOString();
}
