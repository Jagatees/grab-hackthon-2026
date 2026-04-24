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
  votedVenueIds?: string[];
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
  averageTravelTime: number;
  spread: number;
  badge: "Balanced" | "Fastest" | "One-sided" | "Host-friendly";
  explanation: string;
  voteCount: number;
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

type RoomMessage = {
  messageId: string;
  participantId: string;
  participantName: string;
  body: string;
  createdAt: string;
};

type RoomSnapshot = {
  room: {
    roomId: string;
    roomCode: string;
    hostId: string;
    category: string;
    selectedArea: string | null;
    customQuery: string | null;
    rankingMode: "fairest" | "fastest" | "midpoint";
    selectedVenueId: string | null;
    status: "waiting" | "ready" | "computed" | "finalized";
  };
  participants: RoomParticipant[];
  recommendations: RoomRecommendation[];
  messages: RoomMessage[];
};

type SyncSpotRoomProps = {
  roomId: string;
};

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting for players",
  ready: "Ready to compute",
  computed: "Routes computed",
  finalized: "Venue finalized"
};

const MODE_LABELS: Record<string, string> = {
  fairest: "Fairest for all",
  fastest: "Fastest overall",
  midpoint: "Closest midpoint"
};

const TOPIC_OPTIONS = [
  { value: "cafe", label: "Cafe" },
  { value: "restaurant", label: "Restaurant" },
  { value: "shop", label: "Shop" },
  { value: "mall", label: "Mall" },
  { value: "hotel", label: "Hotel" },
  { value: "park", label: "Park" },
  { value: "bar", label: "Bar" },
  { value: "supermarket", label: "Supermarket" }
] as const;

const AREA_OPTIONS = [
  { value: "", label: "Anywhere in Singapore" },
  { value: "ang_mo_kio", label: "Ang Mo Kio" },
  { value: "bishan", label: "Bishan" },
  { value: "bugis", label: "Bugis" },
  { value: "jurong_east", label: "Jurong East" },
  { value: "marina_bay", label: "Marina Bay" },
  { value: "one_north", label: "one-north" },
  { value: "orchard", label: "Orchard" },
  { value: "tampines", label: "Tampines" },
  { value: "woodlands", label: "Woodlands" }
] as const;

const AREA_BIAS: Record<string, { lat: number; lng: number }> = {
  ang_mo_kio: { lat: 1.3691, lng: 103.8454 },
  bishan: { lat: 1.3508, lng: 103.8485 },
  bugis: { lat: 1.3009, lng: 103.8559 },
  jurong_east: { lat: 1.3331, lng: 103.7437 },
  marina_bay: { lat: 1.2823, lng: 103.8585 },
  one_north: { lat: 1.2996, lng: 103.7873 },
  orchard: { lat: 1.3048, lng: 103.8318 },
  tampines: { lat: 1.3526, lng: 103.9442 },
  woodlands: { lat: 1.4361, lng: 103.7865 }
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

function buildGoogleMapsDirectionsUrl(input: {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}) {
  const url = new URL("https://www.google.com/maps/dir/");

  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${input.originLat},${input.originLng}`);
  url.searchParams.set(
    "destination",
    `${input.destinationLat},${input.destinationLng}`
  );
  url.searchParams.set("travelmode", "driving");

  return url.toString();
}

export function SyncSpotRoom({ roomId }: SyncSpotRoomProps) {
  const searchParams = useSearchParams();
  const participantId = searchParams.get("participantId");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [joinName, setJoinName] = useState("");
  const [category, setCategory] = useState("cafe");
  const [selectedArea, setSelectedArea] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [hostFiltersDirty, setHostFiltersDirty] = useState(false);
  const [rankingMode, setRankingMode] = useState<"fairest" | "fastest" | "midpoint">(
    "fairest"
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy invite link");
  const [showInfo, setShowInfo] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [originResults, setOriginResults] = useState<PlaceResult[]>([]);
  const [originStatus, setOriginStatus] = useState<string | null>(null);
  const [hostQueryResults, setHostQueryResults] = useState<PlaceResult[]>([]);
  const [hostQueryStatus, setHostQueryStatus] = useState<string | null>(null);
  const [activeRecommendationIds, setActiveRecommendationIds] = useState<string[]>([]);
  const [chatBody, setChatBody] = useState("");

  async function loadRoom() {
    const response = await fetch(`/api/syncspot/rooms/${roomId}`, {
      cache: "no-store"
    });
    const data = (await response.json()) as RoomSnapshot & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load room.");
    }

    setSnapshot(data);

    if (!hostFiltersDirty) {
      setCategory(data.room.category);
      setSelectedArea(data.room.selectedArea ?? "");
      setCustomQuery(data.room.customQuery ?? "");
      setRankingMode(data.room.rankingMode);
    }
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
  const currentVotes = new Set(currentParticipant?.votedVenueIds ?? []);
  const selectedRecommendation =
    snapshot?.recommendations.find(
      (recommendation) => recommendation.poiId === snapshot.room.selectedVenueId
    ) ?? null;
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

  useEffect(() => {
    if (!isHost) {
      setHostQueryResults([]);
      setHostQueryStatus(null);
      return;
    }

    const trimmedQuery = customQuery.trim();

    if (trimmedQuery.length < 2) {
      setHostQueryResults([]);
      setHostQueryStatus(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setHostQueryStatus("Searching places...");

      try {
        const params = new URLSearchParams({
          keyword: trimmedQuery,
          country: "SGP",
          limit: "5"
        });
        const areaBias = selectedArea ? AREA_BIAS[selectedArea] : null;

        if (areaBias) {
          params.set("location", `${areaBias.lat},${areaBias.lng}`);
        }

        const response = await fetch(
          `/api/grab-maps/places/search?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal
          }
        );
        const data = (await response.json()) as {
          places?: PlaceResult[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to search for places.");
        }

        setHostQueryResults(data.places ?? []);
        setHostQueryStatus(null);
      } catch (searchError) {
        if ((searchError as Error).name === "AbortError") {
          return;
        }

        setHostQueryResults([]);
        setHostQueryStatus(
          searchError instanceof Error
            ? searchError.message
            : "Unable to search for places."
        );
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [customQuery, isHost, selectedArea]);

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
      setEditingOrigin(false);
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
            category,
            selectedArea: selectedArea || null,
            customQuery: customQuery.trim() || null,
            rankingMode
          })
        }
      );
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to compute recommendations.");
      }

      setSnapshot(data);
      setCategory(data.room.category);
      setSelectedArea(data.room.selectedArea ?? "");
      setCustomQuery(data.room.customQuery ?? "");
      setRankingMode(data.room.rankingMode);
      setHostFiltersDirty(false);
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
          category,
          selectedArea: selectedArea || null,
          customQuery: customQuery.trim() || null,
          rankingMode
        })
      });
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update room.");
      }

      setSnapshot(data);
      setCategory(data.room.category);
      setSelectedArea(data.room.selectedArea ?? "");
      setCustomQuery(data.room.customQuery ?? "");
      setRankingMode(data.room.rankingMode);
      setHostFiltersDirty(false);
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

  async function copyFinalSummary(recommendation: RoomRecommendation) {
    const summary = [
      `SyncSpot final meetup: ${recommendation.name}`,
      recommendation.address ?? "No address",
      ...recommendation.perUserTravelTimes.map(
        (time) => `${time.name}: ${formatDuration(time.duration)}`
      )
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopyLabel("Copied");
      window.setTimeout(() => {
        setCopyLabel("Copy invite link");
      }, 1800);
    } catch {
      setError("Unable to copy final summary.");
    }
  }

  async function reopenRoom() {
    if (!snapshot || !currentParticipant) {
      return;
    }

    setLoading("Reopening room...");
    setError(null);

    try {
      const response = await fetch(`/api/syncspot/rooms/${snapshot.room.roomId}/reopen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          participantId: currentParticipant.participantId
        })
      });
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to reopen room.");
      }

      setSnapshot(data);
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : "Unable to reopen room.");
    } finally {
      setLoading(null);
    }
  }

  async function sendMessage() {
    if (!snapshot || !currentParticipant || !chatBody.trim()) {
      return;
    }

    setLoading("Sending message...");
    setError(null);

    try {
      const response = await fetch(`/api/syncspot/rooms/${snapshot.room.roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          body: chatBody
        })
      });
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to send message.");
      }

      setSnapshot(data);
      setChatBody("");
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "Unable to send message.");
    } finally {
      setLoading(null);
    }
  }

  async function toggleVote(venueId: string) {
    if (!snapshot || !currentParticipant) {
      return;
    }

    setLoading("Saving vote...");
    setError(null);

    try {
      const response = await fetch(`/api/syncspot/rooms/${snapshot.room.roomId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          venueId
        })
      });
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to record vote.");
      }

      setSnapshot(data);
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Unable to record vote.");
    } finally {
      setLoading(null);
    }
  }

  async function finalizeVenue(venueId: string) {
    if (!snapshot || !currentParticipant) {
      return;
    }

    setLoading("Finalizing venue...");
    setError(null);

    try {
      const response = await fetch(
        `/api/syncspot/rooms/${snapshot.room.roomId}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            participantId: currentParticipant.participantId,
            venueId
          })
        }
      );
      const data = (await response.json()) as RoomSnapshot & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to finalize venue.");
      }

      setSnapshot(data);
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "Unable to finalize venue."
      );
    } finally {
      setLoading(null);
    }
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
        selectedVenueId={snapshot.room.selectedVenueId}
        onToggleRecommendation={toggleRecommendationRoutes}
      />
      <section className="syncspot-room-card">
        <div className="syncspot-room-header">
          <div className="syncspot-room-summary">
            <div className="syncspot-room-eyebrow-row">
              <p className="eyebrow">SyncSpot room</p>
              <button
                className="syncspot-info-btn"
                onClick={() => setShowInfo(true)}
                type="button"
                aria-label="How it works"
              >
                ℹ
              </button>
            </div>
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
            <div className="syncspot-status-chips">
              <span className={`syncspot-chip syncspot-chip-status-${snapshot.room.status}`}>
                {STATUS_LABELS[snapshot.room.status] ?? snapshot.room.status}
              </span>
              <span className="syncspot-chip syncspot-chip-neutral">
                {snapshot.room.category}
              </span>
              {snapshot.room.selectedArea ? (
                <span className="syncspot-chip syncspot-chip-neutral">
                  {
                    AREA_OPTIONS.find((option) => option.value === snapshot.room.selectedArea)
                      ?.label
                  }
                </span>
              ) : null}
              <span className="syncspot-chip syncspot-chip-neutral">
                {MODE_LABELS[snapshot.room.rankingMode] ?? snapshot.room.rankingMode}
              </span>
            </div>
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
                    className="syncspot-list-item syncspot-list-item-self"
                    key={participant.participantId}
                  >
                    <div>
                      <div className="syncspot-participant-row">
                        <strong>{participant.name}</strong>
                        <div className="syncspot-inline-actions">
                          {(participant.votedVenueIds?.length ?? 0) > 0 ? (
                            <span className="syncspot-pill syncspot-pill-confirmed">
                              Voted
                            </span>
                          ) : null}
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
                      </div>

                      {participant.participantId === currentParticipant?.participantId ? (
                        editingOrigin ? (
                          <>
                            <div className="syncspot-origin-inline-edit">
                              <input
                                autoFocus
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
                              <button
                                className="syncspot-primary-btn"
                                disabled={
                                  loading !== null ||
                                  originStatus === "Searching places..."
                                }
                                onClick={() => void searchOrigins()}
                                type="button"
                              >
                                {originStatus === "Searching places..." ? "…" : "Search"}
                              </button>
                            </div>
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
                          </>
                        ) : (
                          <div className="syncspot-origin-view">
                            <span>
                              {participant.originLabel ?? "Tap Edit to set your location"}
                            </span>
                            <button
                              className="syncspot-edit-btn"
                              onClick={() => setEditingOrigin(true)}
                              type="button"
                            >
                              Edit
                            </button>
                          </div>
                        )
                      ) : (
                        <span>
                          {participant.originLabel ?? "Origin not confirmed yet"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {isHost ? (
              <section className="syncspot-card">
                <h2>Host actions</h2>
                <label className="syncspot-field">
                  <span>Topic</span>
                  <select
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setHostFiltersDirty(true);
                    }}
                    value={category}
                  >
                    {TOPIC_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="syncspot-field">
                  <span>Singapore area</span>
                  <select
                    onChange={(event) => {
                      setSelectedArea(event.target.value);
                      setHostFiltersDirty(true);
                    }}
                    value={selectedArea}
                  >
                    {AREA_OPTIONS.map((option) => (
                      <option key={option.value || "any"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="syncspot-field">
                  <span>Specific place or vibe</span>
                  <input
                    onChange={(event) => {
                      setCustomQuery(event.target.value);
                      setHostFiltersDirty(true);
                    }}
                    placeholder="Bubble tea, IKEA, quiet cafe, study spot..."
                    value={customQuery}
                  />
                  {hostQueryStatus && hostQueryStatus !== "Searching places..." ? (
                    <p className="syncspot-origin-status">{hostQueryStatus}</p>
                  ) : null}
                  {hostQueryResults.length > 0 ? (
                    <ul className="syncspot-origin-results">
                      {hostQueryResults.map((place, index) => (
                        <li
                          className="syncspot-origin-result"
                          key={`${place.poi_id ?? place.id ?? place.name ?? "host-place"}-${index}`}
                        >
                          <div>
                            <strong>{place.name ?? "Unknown place"}</strong>
                            <span>{place.formatted_address ?? "No address available"}</span>
                          </div>
                          <button
                            className="syncspot-secondary-btn"
                            onClick={() => {
                              setCustomQuery(place.name ?? place.formatted_address ?? "");
                              setHostQueryResults([]);
                              setHostQueryStatus(null);
                              setHostFiltersDirty(true);
                            }}
                            type="button"
                          >
                            Use this place
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
                <label className="syncspot-field">
                  <span>Ranking mode</span>
                  <select
                    onChange={(event) => {
                      setRankingMode(
                        event.target.value as "fairest" | "fastest" | "midpoint"
                      );
                      setHostFiltersDirty(true);
                    }}
                    value={rankingMode}
                  >
                    <option value="fairest">Fairest for everyone</option>
                    <option value="fastest">Fastest overall</option>
                    <option value="midpoint">Closest midpoint</option>
                  </select>
                </label>
                <p className="syncspot-muted">
                  Use a broad topic, narrow it to an area, or type a specific place idea to guide
                  the Grab search.
                </p>
                <div className="syncspot-inline-actions">
                  <button
                    className="syncspot-secondary-btn"
                    disabled={loading !== null}
                    onClick={() => void updateRoomCategory()}
                    type="button"
                  >
                    {loading === "Updating room..." ? loading : "Save settings"}
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
                Compare the shortlist, vote on favorites, and click any place card to toggle its
                routes on the map.
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
                    <span>{recommendation.badge}</span>
                    <span>
                      {recommendation.voteCount} vote
                      {recommendation.voteCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="syncspot-metrics">
                    <span>Worst: {formatDuration(recommendation.maxTravelTime)}</span>
                    <span>Best: {formatDuration(recommendation.minTravelTime)}</span>
                    <span>Total: {formatDuration(recommendation.totalTravelTime)}</span>
                  </div>
                  <p className="syncspot-recommendation-explanation">
                    {recommendation.explanation}
                  </p>
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
                  <div className="syncspot-inline-actions">
                    {currentParticipant ? (
                      <button
                        className="syncspot-secondary-btn"
                        disabled={loading !== null || snapshot.room.status === "finalized"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleVote(recommendation.poiId);
                        }}
                        type="button"
                      >
                        {currentVotes.has(recommendation.poiId) ? "Remove vote" : "Vote"}
                      </button>
                    ) : null}
                    {isHost ? (
                      <button
                        className="syncspot-primary-btn"
                        disabled={loading !== null || snapshot.room.status === "finalized"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void finalizeVenue(recommendation.poiId);
                        }}
                        type="button"
                      >
                        Finalize
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {error ? <p className="syncspot-error">{error}</p> : null}
      </section>

      {selectedRecommendation ? (
        <section className="syncspot-final-overlay">
          <div className="syncspot-final-card">
            <div className="syncspot-final-hero">
              <div className="syncspot-final-badge-row">
                <span className="syncspot-final-badge">Room finalized</span>
                <span className="syncspot-final-badge">{selectedRecommendation.badge}</span>
              </div>
              <div className="syncspot-final-score">
                <span>Top pick</span>
                <strong>#{selectedRecommendation.rank}</strong>
              </div>
            </div>

            <div className="syncspot-final-body">
              <div className="syncspot-final-title-row">
                <div>
                  <h2>{selectedRecommendation.name}</h2>
                  <p>{selectedRecommendation.address ?? "No address"}</p>
                </div>
                <div className="syncspot-final-votes">
                  <span>Votes</span>
                  <strong>{selectedRecommendation.voteCount}</strong>
                </div>
              </div>

              <div className="syncspot-metrics">
                <span>Worst: {formatDuration(selectedRecommendation.maxTravelTime)}</span>
                <span>Best: {formatDuration(selectedRecommendation.minTravelTime)}</span>
                <span>Total: {formatDuration(selectedRecommendation.totalTravelTime)}</span>
              </div>

              <p className="syncspot-recommendation-explanation">
                {selectedRecommendation.explanation}
              </p>

              <ul className="syncspot-time-list">
                {selectedRecommendation.perUserTravelTimes.map((time) => (
                  <li key={time.participantId}>
                    <span>{time.name}</span>
                    <span>{formatDuration(time.duration)}</span>
                    {(() => {
                      const participant = snapshot.participants.find(
                        (item) => item.participantId === time.participantId
                      );

                      if (
                        !participant ||
                        participant.originLat === null ||
                        participant.originLng === null
                      ) {
                        return null;
                      }

                      const googleMapsUrl = buildGoogleMapsDirectionsUrl({
                        originLat: participant.originLat,
                        originLng: participant.originLng,
                        destinationLat: selectedRecommendation.lat,
                        destinationLng: selectedRecommendation.lng
                      });

                      return (
                        <a
                          className="syncspot-secondary-btn syncspot-link-btn"
                          href={googleMapsUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open route
                        </a>
                      );
                    })()}
                  </li>
                ))}
              </ul>

              <div className="syncspot-inline-actions">
                <button
                  className="syncspot-secondary-btn"
                  onClick={() => void copyFinalSummary(selectedRecommendation)}
                  type="button"
                >
                  Copy result summary
                </button>
                {isHost ? (
                  <button
                    className="syncspot-primary-btn"
                    disabled={loading !== null}
                    onClick={() => void reopenRoom()}
                    type="button"
                  >
                    {loading === "Reopening room..." ? loading : "Reopen voting"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showInfo && (
        <div
          className="syncspot-info-overlay"
          onClick={() => setShowInfo(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How SyncSpot works"
        >
          <div
            className="syncspot-info-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="syncspot-info-header">
              <strong>How SyncSpot works</strong>
              <button
                className="syncspot-info-close"
                onClick={() => setShowInfo(false)}
                type="button"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="syncspot-info-body">
              <dl className="syncspot-info-glossary">
                <dt>Room status</dt>
                <dd>
                  <strong>Waiting for players</strong> — People are still joining and
                  confirming where they&apos;re coming from.
                </dd>
                <dd>
                  <strong>Ready to compute</strong> — Enough confirmed origins. Host can
                  now run route calculations.
                </dd>
                <dd>
                  <strong>Routes computed</strong> — Travel times calculated for all
                  suggested venues. Vote on your favourite.
                </dd>
                <dd>
                  <strong>Venue finalized</strong> — The host picked a spot. Tap
                  &ldquo;Open route&rdquo; to get directions.
                </dd>

                <dt>Ranking mode</dt>
                <dd>
                  <strong>Fairest for all</strong> — Minimises the worst individual travel
                  time. Nobody gets stuck with a very long trip.
                </dd>
                <dd>
                  <strong>Fastest overall</strong> — Minimises the total combined travel
                  time for the whole group.
                </dd>
                <dd>
                  <strong>Closest midpoint</strong> — Finds a venue that is geographically
                  close to everyone&apos;s average location.
                </dd>

                <dt>Venue badges</dt>
                <dd>
                  <strong>Balanced</strong> — Travel times are very similar for everyone
                  in the group.
                </dd>
                <dd>
                  <strong>Fastest</strong> — Lowest total combined travel time.
                </dd>
                <dd>
                  <strong>One-sided</strong> — Someone travels noticeably more than
                  everyone else.
                </dd>
                <dd>
                  <strong>Host-friendly</strong> — Short trip for whoever created the
                  room.
                </dd>

                <dt>Travel metrics</dt>
                <dd>
                  <strong>Worst</strong> — The longest individual trip in the group.
                </dd>
                <dd>
                  <strong>Best</strong> — The shortest individual trip in the group.
                </dd>
                <dd>
                  <strong>Total</strong> — Sum of all travel times combined.
                </dd>
                <dd>
                  <strong>Score</strong> — A fairness score. A smaller gap between Worst
                  and Best means a more balanced venue.
                </dd>
              </dl>
            </div>
          </div>
        </div>
      )}

      {currentParticipant ? (
        <section className="syncspot-chat-dock">
          <div className="syncspot-chat-card">
            <div className="syncspot-chat-header">
              <div>
                <strong>Room chat</strong>
                <span>Talk through the decision here.</span>
              </div>
              <span className="syncspot-pill syncspot-pill-confirmed">
                {snapshot.messages.length}
              </span>
            </div>

            <div className="syncspot-chat-messages">
              {snapshot.messages.length === 0 ? (
                <p className="syncspot-muted">No messages yet. Start the discussion.</p>
              ) : (
                snapshot.messages.map((message) => (
                  <article
                    className={`syncspot-chat-message ${
                      message.participantId === currentParticipant.participantId
                        ? "syncspot-chat-message-self"
                        : ""
                    }`}
                    key={message.messageId}
                  >
                    <strong>{message.participantName}</strong>
                    <p>{message.body}</p>
                  </article>
                ))
              )}
            </div>

            <div className="syncspot-chat-compose">
              <textarea
                onChange={(event) => setChatBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Say where you want to go..."
                value={chatBody}
              />
              <button
                className="syncspot-primary-btn"
                disabled={loading !== null || !chatBody.trim()}
                onClick={() => void sendMessage()}
                type="button"
              >
                {loading === "Sending message..." ? loading : "Send"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
