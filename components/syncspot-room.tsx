"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SyncSpotRoomMap } from "@/components/syncspot-room-map";

type RoomParticipant = {
  participantId: string;
  name: string;
  originLat: number | null;
  originLng: number | null;
  originLabel: string | null;
  confirmed: boolean;
};

type PlaceResult = {
  poi_id?: string;
  id?: string;
  name?: string;
  formatted_address?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
};

type RoomRecommendation = {
  poiId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  fairnessScore: number;
  maxTravelTime: number;
  minTravelTime: number;
  totalTravelTime: number;
  rank: number;
  perUserTravelTimes: Array<{
    participantId: string;
    name: string;
    profile?: "driving" | "motorcycle" | "tricycle" | "cycling" | "walking";
    duration: number;
    distance: number;
    geometry: string | null;
  }>;
};

type RoomSnapshot = {
  room: {
    roomId: string;
    roomCode: string;
    hostId: string;
    category: string;
    status: "waiting" | "ready" | "computed";
  };
  participants: RoomParticipant[];
  recommendations: RoomRecommendation[];
};

type SyncSpotRoomProps = {
  roomId: string;
};

function isPostcodeQuery(value: string) {
  return /^\d{6}$/.test(value.trim());
}

function extractPostcode(place: PlaceResult) {
  const haystack = `${place.formatted_address ?? ""} ${place.name ?? ""}`;
  const match = haystack.match(/\b\d{6}\b/);

  return match?.[0] ?? null;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);

  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  return `${minutes}m`;
}

export function SyncSpotRoom({ roomId }: SyncSpotRoomProps) {
  const searchParams = useSearchParams();
  const participantId = searchParams.get("participantId");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [joinName, setJoinName] = useState("");
  const [category, setCategory] = useState("cafe");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy invite link");
  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<PlaceResult[]>([]);
  const [originStatus, setOriginStatus] = useState<string | null>(null);
  const [activeRecommendationIds, setActiveRecommendationIds] = useState<string[]>([]);

  async function loadRoom() {
    const response = await fetch(`/api/syncspot/rooms/${roomId}`, {
      cache: "no-store"
    });
    const data = (await response.json()) as RoomSnapshot & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load room.");
    }

    setSnapshot(data);
    setCategory(data.room.category);
  }

  useEffect(() => {
    void loadRoom();

    const interval = setInterval(() => {
      void loadRoom();
    }, 5000);

    return () => clearInterval(interval);
  }, [roomId]);

  const currentParticipant = useMemo(
    () =>
      snapshot?.participants.find(
        (participant) => participant.participantId === participantId
      ) ?? null,
    [participantId, snapshot]
  );
  const isHost = currentParticipant?.participantId === snapshot?.room.hostId;
  const renderedRecommendations =
    snapshot?.recommendations.filter((recommendation) =>
      activeRecommendationIds.includes(recommendation.poiId)
    ) ?? [];

  useEffect(() => {
    if (!snapshot?.recommendations.length) {
      setActiveRecommendationIds([]);
      return;
    }

    setActiveRecommendationIds((current) =>
      current.filter((recommendationId) =>
        snapshot.recommendations.some(
          (recommendation) => recommendation.poiId === recommendationId
        )
      )
    );
  }, [snapshot]);

  useEffect(() => {
    if (!currentParticipant?.originLabel) {
      return;
    }

    setOriginQuery((current) => (current.trim() ? current : currentParticipant.originLabel ?? ""));
  }, [currentParticipant?.originLabel]);

  const shareUrl =
    typeof window === "undefined" || !snapshot
      ? ""
      : `${window.location.origin}/room/${snapshot.room.roomId}`;

  async function copyShareUrl() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("Copied");
      window.setTimeout(() => {
        setCopyLabel("Copy invite link");
      }, 1800);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => {
        setCopyLabel("Copy invite link");
      }, 1800);
    }
  }

  async function joinByLink() {
    if (!joinName.trim()) {
      setError("Enter your name before joining the room.");
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
          roomId,
          name: joinName
        })
      });
      const data = (await response.json()) as {
        room: { roomId: string };
        participant: { participantId: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to join room.");
      }

      window.location.href = `/room/${data.room.roomId}?participantId=${data.participant.participantId}`;
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join room.");
    } finally {
      setLoading(null);
    }
  }

  async function searchOrigins() {
    const trimmedQuery = originQuery.trim();

    if (!trimmedQuery) {
      setError("Enter an area, address, or postcode first.");
      return;
    }

    setOriginStatus("Searching places...");
    setError(null);

    try {
      const params = new URLSearchParams({
        keyword: trimmedQuery,
        country: "SGP",
        limit: "5"
      });
      const response = await fetch(`/api/grab-maps/places/search?${params.toString()}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as {
        places?: PlaceResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to search for that origin.");
      }

      const places = data.places ?? [];

      if (isPostcodeQuery(trimmedQuery)) {
        const exactPostcodeMatches = places.filter(
          (place) => extractPostcode(place) === trimmedQuery
        );

        if (exactPostcodeMatches.length === 0) {
          setOriginResults([]);
          setOriginStatus(`No exact postcode match found for ${trimmedQuery}.`);
          return;
        }

        setOriginResults(exactPostcodeMatches);
        setOriginStatus(
          exactPostcodeMatches.length === 1
            ? "Found 1 exact postcode match."
            : `Found ${exactPostcodeMatches.length} exact postcode matches.`
        );
        return;
      }

      setOriginResults(places);
      setOriginStatus(null);
    } catch (searchError) {
      setOriginStatus(null);
      setOriginResults([]);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Unable to search for that origin."
      );
    }
  }

  async function confirmOrigin(place: PlaceResult) {
    if (!snapshot || !currentParticipant || !place.location) {
      return;
    }

    setOriginStatus("Saving origin...");
    setError(null);

    try {
      const response = await fetch(
        `/api/syncspot/rooms/${snapshot.room.roomId}/participants/${currentParticipant.participantId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            originLat: place.location.latitude,
            originLng: place.location.longitude,
            originLabel: place.formatted_address ?? place.name ?? originQuery.trim(),
            confirmed: true
          })
        }
      );
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save starting point.");
      }

      setSnapshot(data);
      setOriginResults([]);
      setOriginQuery(place.formatted_address ?? place.name ?? "");
      setOriginStatus("Starting point confirmed.");
      window.setTimeout(() => setOriginStatus(null), 1800);
    } catch (confirmError) {
      setOriginStatus(null);
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to save starting point."
      );
    }
  }

  async function computeRecommendations() {
    if (!snapshot) {
      return;
    }

    setLoading("Finding fair spots...");
    setError(null);

    try {
      const response = await fetch(
        `/api/syncspot/rooms/${snapshot.room.roomId}/recommendations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            category
          })
        }
      );
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to compute recommendations.");
      }

      setSnapshot(data);
      setActiveRecommendationIds([]);
    } catch (computeError) {
      setError(
        computeError instanceof Error
          ? computeError.message
          : "Unable to compute recommendations."
      );
    } finally {
      setLoading(null);
    }
  }

  async function updateRoomCategory() {
    if (!snapshot) {
      return;
    }

    setLoading("Updating room...");
    setError(null);

    try {
      const response = await fetch(`/api/syncspot/rooms/${snapshot.room.roomId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category
        })
      });
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update room.");
      }

      setSnapshot(data);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update room.");
    } finally {
      setLoading(null);
    }
  }

  function toggleRecommendationRoutes(poiId: string) {
    setActiveRecommendationIds((current) =>
      current.includes(poiId)
        ? current.filter((recommendationId) => recommendationId !== poiId)
        : [...current, poiId]
    );
  }

  function clearRenderedPaths() {
    setActiveRecommendationIds([]);
  }

  if (!snapshot) {
    return (
      <main className="syncspot-room-shell">
        <section className="syncspot-room-card">
          <p className="syncspot-muted">Loading room...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="syncspot-room-shell">
      <SyncSpotRoomMap
        participants={snapshot.participants}
        recommendations={snapshot.recommendations}
        activeRecommendationIds={activeRecommendationIds}
        onToggleRecommendation={toggleRecommendationRoutes}
      />
      <section className="syncspot-room-card">
        <div className="syncspot-room-header">
          <div className="syncspot-room-summary">
            <p className="eyebrow">SyncSpot room</p>
            <div className="syncspot-room-title-row">
              <h1>Room {snapshot.room.roomCode}</h1>
              <button
                className="syncspot-secondary-btn syncspot-copy-btn"
                onClick={() => void copyShareUrl()}
                type="button"
              >
                {copyLabel}
              </button>
            </div>
            <p className="syncspot-muted">
              Status: {snapshot.room.status} · Category: {snapshot.room.category}
            </p>
            <p className="syncspot-share-url">
              Invite: {shareUrl || `/room/${snapshot.room.roomId}`}
            </p>
          </div>
        </div>

        {!currentParticipant ? (
          <div className="syncspot-card syncspot-room-join">
            <label className="syncspot-field">
              <span>Your name</span>
              <input
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="Enter your name"
                value={joinName}
              />
            </label>
            <button
              className="syncspot-primary-btn"
              disabled={loading !== null}
              onClick={() => void joinByLink()}
              type="button"
            >
              {loading ?? "Join this room"}
            </button>
          </div>
        ) : (
          <div className="syncspot-room-grid">
            <section className="syncspot-card">
              <h2>Participants</h2>
              <ul className="syncspot-list">
                {snapshot.participants.map((participant) => (
                  <li
                    className={`syncspot-list-item ${
                      participant.participantId === currentParticipant?.participantId
                        ? "syncspot-list-item-self"
                        : ""
                    }`}
                    key={participant.participantId}
                  >
                    <div>
                      <div className="syncspot-participant-row">
                        <strong>{participant.name}</strong>
                        <span
                          className={`syncspot-pill ${
                            participant.confirmed
                              ? "syncspot-pill-confirmed"
                              : "syncspot-pill-pending"
                          }`}
                        >
                          {participant.confirmed ? "Confirmed" : "Pending"}
                        </span>
                      </div>
                      <span>{participant.originLabel ?? "Origin not confirmed yet"}</span>
                    </div>

                    {participant.participantId === currentParticipant?.participantId ? (
                      <div className="syncspot-inline-origin-editor">
                        <label className="syncspot-field">
                          <span>Edit my place</span>
                          <input
                            onChange={(event) => setOriginQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void searchOrigins();
                              }
                            }}
                            placeholder="Jurong East, 600324, Tampines..."
                            value={originQuery}
                          />
                        </label>
                        <button
                          className="syncspot-primary-btn"
                          disabled={loading !== null || originStatus === "Searching places..."}
                          onClick={() => void searchOrigins()}
                          type="button"
                        >
                          {originStatus === "Searching places..."
                            ? originStatus
                            : "Update place"}
                        </button>

                        {originStatus && originStatus !== "Searching places..." ? (
                          <p className="syncspot-origin-status">{originStatus}</p>
                        ) : null}

                        {originResults.length > 0 ? (
                          <ul className="syncspot-origin-results">
                            {originResults.map((place, index) => (
                              <li
                                className="syncspot-origin-result"
                                key={`${place.poi_id ?? place.id ?? place.name ?? "place"}-${index}`}
                              >
                                <div>
                                  <strong>{place.name ?? "Unknown place"}</strong>
                                  <span>
                                    {place.formatted_address ?? "No address available"}
                                  </span>
                                </div>
                                <button
                                  className="syncspot-secondary-btn"
                                  onClick={() => void confirmOrigin(place)}
                                  type="button"
                                >
                                  Use this spot
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            {isHost ? (
              <section className="syncspot-card">
                <h2>Host actions</h2>
                <label className="syncspot-field">
                  <span>Meetup category</span>
                  <select
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    <option value="cafe">Cafe</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="park">Park</option>
                  </select>
                </label>
                <div className="syncspot-inline-actions">
                  <button
                    className="syncspot-secondary-btn"
                    disabled={loading !== null}
                    onClick={() => void updateRoomCategory()}
                    type="button"
                  >
                    {loading === "Updating room..." ? loading : "Save category"}
                  </button>
                  <button
                    className="syncspot-primary-btn"
                    disabled={loading !== null}
                    onClick={() => void computeRecommendations()}
                    type="button"
                  >
                    {loading === "Finding fair spots..." ? loading : "Find fair spot"}
                  </button>
                  <button
                    className="syncspot-secondary-btn"
                    disabled={activeRecommendationIds.length === 0}
                    onClick={clearRenderedPaths}
                    type="button"
                  >
                    Clear paths
                  </button>
                </div>
                {renderedRecommendations.length > 0 ? (
                  <div className="syncspot-render-manager">
                    <strong>Rendered on map</strong>
                    <div className="syncspot-render-list">
                      {renderedRecommendations.map((recommendation) => (
                        <button
                          className="syncspot-render-chip"
                          key={recommendation.poiId}
                          onClick={() => toggleRecommendationRoutes(recommendation.poiId)}
                          type="button"
                        >
                          <span>{recommendation.name}</span>
                          <span>Remove</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}

        <section className="syncspot-card">
          <div className="syncspot-section-header">
            <div>
              <h2>Recommendations</h2>
              <p className="syncspot-muted">
                Click any place card to toggle its routes on the map. You can compare multiple
                options at the same time.
              </p>
            </div>
            {activeRecommendationIds.length > 0 ? (
              <span className="syncspot-pill syncspot-pill-confirmed">
                {activeRecommendationIds.length} route set
                {activeRecommendationIds.length > 1 ? "s" : ""} shown
              </span>
            ) : null}
          </div>
          {snapshot.recommendations.length === 0 ? (
            <p className="syncspot-muted">
              No recommendations yet. Once at least two participants confirm origins,
              the host can compute fair meetup spots.
            </p>
          ) : (
            <div className="syncspot-recommendations">
              {snapshot.recommendations.map((recommendation) => (
                <article
                  className={`syncspot-recommendation ${
                    activeRecommendationIds.includes(recommendation.poiId)
                      ? "syncspot-recommendation-active"
                      : ""
                  }`}
                  key={recommendation.poiId}
                  onClick={() => toggleRecommendationRoutes(recommendation.poiId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleRecommendationRoutes(recommendation.poiId);
                    }
                  }}
                >
                  <div className="syncspot-recommendation-header">
                    <strong>
                      #{recommendation.rank} {recommendation.name}
                    </strong>
                    <span>Score {recommendation.fairnessScore}</span>
                  </div>
                  <p>{recommendation.address ?? "No address"}</p>
                  <div className="syncspot-metrics">
                    <span>Worst: {formatDuration(recommendation.maxTravelTime)}</span>
                    <span>Best: {formatDuration(recommendation.minTravelTime)}</span>
                    <span>Total: {formatDuration(recommendation.totalTravelTime)}</span>
                  </div>
                  <ul className="syncspot-time-list">
                    {recommendation.perUserTravelTimes.map((time) => (
                      <li key={time.participantId}>
                        <span>
                          {time.name}
                          {time.profile ? ` · ${time.profile}` : ""}
                        </span>
                        <span>{formatDuration(time.duration)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        {error ? <p className="syncspot-error">{error}</p> : null}
      </section>
    </main>
  );
}
