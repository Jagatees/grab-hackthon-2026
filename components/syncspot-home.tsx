"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateRoomResponse = {
  room: {
    roomId: string;
    roomCode: string;
  };
  participant: {
    participantId: string;
  };
};

type JoinRoomResponse = {
  room: {
    roomId: string;
    roomCode: string;
  };
  participant: {
    participantId: string;
  };
};

export function SyncSpotHome() {
  const router = useRouter();
  const [mode, setMode] = useState<"host" | "join">("host");
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    if (!hostName.trim()) {
      setError("Enter your name before creating a room.");
      return;
    }

    setLoading("Creating room...");
    setError(null);

    try {
      const response = await fetch("/api/syncspot/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          hostName
        })
      });
      const data = (await response.json()) as CreateRoomResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create room.");
      }

      router.push(
        `/room/${data.room.roomId}?participantId=${data.participant.participantId}`
      );
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Unable to create room."
      );
    } finally {
      setLoading(null);
    }
  }

  async function joinRoom() {
    if (!joinName.trim() || !roomCode.trim()) {
      setError("Enter your name and room code before joining.");
      return;
    }

    setLoading("Joining room...");
    setError(null);

    try {
      const response = await fetch("/api/syncspot/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomCode,
          name: joinName
        })
      });
      const data = (await response.json()) as JoinRoomResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to join room.");
      }

      router.push(
        `/room/${data.room.roomId}?participantId=${data.participant.participantId}`
      );
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join room.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="syncspot-home">
      <section className="syncspot-hero">
        <p className="eyebrow">SyncSpot</p>
        <h1>Find the fairest meetup spot with real travel time.</h1>
        <p className="syncspot-lede">
          Create a room, invite your group, confirm where everyone is coming from,
          and rank meetup places by actual route time instead of guesswork.
        </p>

        <div className="syncspot-mode-switch">
          <button
            className={`syncspot-mode-btn ${mode === "host" ? "syncspot-mode-btn-active" : ""}`}
            onClick={() => setMode("host")}
            type="button"
          >
            Host a room
          </button>
          <button
            className={`syncspot-mode-btn ${mode === "join" ? "syncspot-mode-btn-active" : ""}`}
            onClick={() => setMode("join")}
            type="button"
          >
            Join a room
          </button>
        </div>

        <div className="syncspot-card">
          {mode === "host" ? (
            <>
              <label className="syncspot-field">
                <span>Your name</span>
                <input
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Jaga"
                  value={hostName}
                />
              </label>

              <button
                className="syncspot-primary-btn"
                disabled={loading !== null}
                onClick={() => void createRoom()}
                type="button"
              >
                {loading ?? "Create room"}
              </button>
            </>
          ) : (
            <>
              <label className="syncspot-field">
                <span>Your name</span>
                <input
                  onChange={(event) => setJoinName(event.target.value)}
                  placeholder="Alex"
                  value={joinName}
                />
              </label>

              <label className="syncspot-field">
                <span>Room code</span>
                <input
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  value={roomCode}
                />
              </label>

              <button
                className="syncspot-primary-btn"
                disabled={loading !== null}
                onClick={() => void joinRoom()}
                type="button"
              >
                {loading ?? "Join room"}
              </button>
            </>
          )}

          {error ? <p className="syncspot-error">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
