"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type UrgeStrength = "vague" | "medium" | "strong";
type UrgeOutcome = "beat" | "lost";
type FrontId = "routine" | "priorities" | "boss";
type CheckpostStatus = "pending" | "won" | "lost" | "given-up";
type BossStatus = "active" | "defeated" | "given-up" | "archived";
type Priority = "routine" | "high" | "medium" | "low";

type XpEvent = {
  id: string;
  date: string;
  label: string;
  amount: number;
  source: string;
  minutes?: number;
  outcome?: "win" | "loss" | "give-up" | "leave" | "progress";
  reason?: string;
  entityId?: string;
  entityName?: string;
};

type Checkpost = {
  id: string;
  front: Exclude<FrontId, "boss">;
  name: string;
  priority: Priority;
  allottedMinutes: number;
  loggedMinutes: number;
  description: string;
  status: CheckpostStatus;
  coordinateIndex: number;
};

type BossBattle = {
  id: string;
  name: string;
  allottedMinutes: number;
  loggedMinutes: number;
  description: string;
  coordinateIndex: number;
  image: string;
  workedDates: Record<string, boolean>;
  status: BossStatus;
  completedAt?: string;
};

type LeaveRequest = {
  id: string;
  date: string;
  reason: string;
  note: string;
  requestedAt: number;
  approvedAt: number;
};

type DayRecord = {
  date: string;
  xpDelta: number;
  events: XpEvent[];
  checkposts: Checkpost[];
  bosses: BossBattle[];
  leaveRequest?: LeaveRequest;
  evaluated: boolean;
};

type CubeCycle = {
  id: string;
  startedAt: string;
  endsAt: string;
  eventIds: string[];
  plateCount: number;
  status: "active" | "completed";
  completionReason?: "ten-day-cycle" | "cube-full";
  completedAt?: string;
};

type DayReport = {
  date: string;
  generatedAt: string;
  title: string;
  summary: string;
  statements: string[];
  xpDelta: number;
  wins: number;
  losses: number;
};

type AppState = {
  totalXp: number;
  days: Record<string, DayRecord>;
  cubeCycles: Record<string, CubeCycle>;
  activeCubeCycleId: string;
  reports: Record<string, DayReport>;
};

type AddDraft = {
  name: string;
  allottedMinutes: number;
  priority: Priority;
  description: string;
};

const STORAGE_KEY = "inner-war-v3";
const AMBIENT_STORAGE_KEY = "inner-war-ambient-v1";
const REWARD_SOUND_STORAGE_KEY = "inner-war-reward-sound-v1";
const CUBE_CAPACITY = 486;
const CUBE_CYCLE_DAYS = 10;
const TIME_ZONE = "Asia/Calcutta";
const TODAY = () => localDateKey();

type AmbientTrackId = "rain-keep" | "temple-depths" | "night-wind" | "ember-hall" | "deep-ocean" | "brown-noise";
type AmbientStatus = "idle" | "playing" | "paused";

const AMBIENT_TRACKS: Array<{ id: AmbientTrackId; name: string; subtitle: string }> = [
  { id: "rain-keep", name: "Rain Keep", subtitle: "soft rain, low stone drone" },
  { id: "temple-depths", name: "Temple Depths", subtitle: "warm hum, slow bells" },
  { id: "night-wind", name: "Night Wind", subtitle: "air, distant pressure, calm dark" },
  { id: "ember-hall", name: "Ember Hall", subtitle: "low fire, warm room tone" },
  { id: "deep-ocean", name: "Deep Ocean", subtitle: "distant tide, submerged calm" },
  { id: "brown-noise", name: "Brown Noise", subtitle: "steady low focus wash" },
];

const URGE_XP: Record<UrgeOutcome, Record<UrgeStrength, number>> = {
  beat: { vague: 3, medium: 5, strong: 10 },
  lost: { vague: -10, medium: -5, strong: -3 },
};

const PRIORITY_XP: Record<Priority, { win: number; miss: number }> = {
  routine: { win: 5, miss: -5 },
  high: { win: 10, miss: -10 },
  medium: { win: 5, miss: -5 },
  low: { win: 3, miss: -3 },
};

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function platesForXp(amount: number) {
  return Math.max(1, Math.round(Math.abs(amount) / 5));
}

function makeCubeCycle(startedAt = TODAY()): CubeCycle {
  const id = crypto.randomUUID();
  return {
    id,
    startedAt,
    endsAt: addDays(startedAt, CUBE_CYCLE_DAYS),
    eventIds: [],
    plateCount: 0,
    status: "active",
  };
}

const ROUTINE_COORDS = [
  { x: 14, y: 72 },
  { x: 23, y: 53 },
  { x: 31, y: 33 },
  { x: 43, y: 61 },
  { x: 51, y: 44 },
  { x: 60, y: 24 },
  { x: 70, y: 55 },
  { x: 79, y: 36 },
  { x: 86, y: 68 },
  { x: 38, y: 77 },
];

const PRIORITY_COORDS = [
  { x: 18, y: 57 },
  { x: 29, y: 37 },
  { x: 42, y: 66 },
  { x: 53, y: 42 },
  { x: 64, y: 27 },
  { x: 73, y: 59 },
  { x: 83, y: 38 },
  { x: 88, y: 72 },
];

const BOSS_COORDS = [
  { x: 31, y: 50 },
  { x: 69, y: 49 },
];

const LEAVE_REASONS = ["Outing", "Exam", "Travel", "Family work", "Physical work", "Health", "Other"];

const defaultState = (): AppState => {
  const today = TODAY();
  const cycle = makeCubeCycle(today);
  return {
    totalXp: 0,
    days: {
      [today]: {
        date: today,
        xpDelta: 0,
        events: [],
        checkposts: seedCheckposts(),
        bosses: [],
        evaluated: false,
      },
    },
    cubeCycles: {
      [cycle.id]: cycle,
    },
    activeCubeCycleId: cycle.id,
    reports: {},
  };
};

function seedCheckposts(): Checkpost[] {
  return [];
}

function makeCheckpost(
  name: string,
  front: Exclude<FrontId, "boss">,
  priority: Priority,
  allottedMinutes: number,
  description: string,
  coordinateIndex: number,
  id = crypto.randomUUID(),
): Checkpost {
  return {
    id,
    front,
    name,
    priority,
    allottedMinutes,
    loggedMinutes: 0,
    description,
    status: "pending",
    coordinateIndex,
  };
}

function makeBoss(name: string, allottedMinutes: number, description: string, coordinateIndex: number, id = crypto.randomUUID(), image = "/assets/boss1.webp"): BossBattle {
  return {
    id,
    name,
    allottedMinutes,
    loggedMinutes: 0,
    description,
    coordinateIndex,
    image,
    workedDates: {},
    status: "active",
  };
}

function xpRequiredForLevel(level: number) {
  return 100 + Math.floor((level - 1) ** 1.35 * 35);
}

function levelFromXp(totalXp: number) {
  let remaining = Math.max(0, totalXp);
  let level = 1;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level += 1;
  }
  return {
    level,
    progressXp: remaining,
    requiredXp: xpRequiredForLevel(level),
    percent: Math.min(100, (remaining / xpRequiredForLevel(level)) * 100),
  };
}

function todayRecord(state: AppState, date = TODAY()) {
  return state.days[date] ?? {
    date,
    xpDelta: 0,
    events: [],
    checkposts: seedCheckposts(),
    bosses: [],
    evaluated: false,
  };
}

function allEvents(days: Record<string, DayRecord>) {
  return Object.values(days)
    .flatMap((day) => day.events)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function migrateState(raw: Partial<AppState>): AppState {
  const fallback = defaultState();
  const days = raw.days ?? fallback.days;
  const normalizedDays = Object.fromEntries(
    Object.entries(days).map(([date, day]) => [
      date,
      {
        ...day,
        events: day.events ?? [],
        checkposts: day.checkposts ?? [],
        bosses: (day.bosses ?? []).map((boss, index) => ({
          ...boss,
          image: boss.image || (index === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp"),
          status: boss.status ?? "active",
          workedDates: boss.workedDates ?? {},
        })),
        evaluated: Boolean(day.evaluated),
      },
    ]),
  );
  const existingCycles = raw.cubeCycles ?? {};
  const activeExisting = raw.activeCubeCycleId ? existingCycles[raw.activeCubeCycleId] : undefined;
  if (activeExisting) {
    return {
      totalXp: raw.totalXp ?? 0,
      days: normalizedDays,
      cubeCycles: existingCycles,
      activeCubeCycleId: raw.activeCubeCycleId as string,
      reports: raw.reports ?? {},
    };
  }

  const sortedEvents = allEvents(normalizedDays);
  const startDate = sortedEvents[0]?.date ?? TODAY();
  const cycle = makeCubeCycle(startDate);
  const plateCount = sortedEvents.reduce((sum, event) => sum + platesForXp(event.amount), 0);
  const migratedCycle: CubeCycle = {
    ...cycle,
    eventIds: sortedEvents.map((event) => event.id),
    plateCount,
  };
  return {
    totalXp: raw.totalXp ?? 0,
    days: normalizedDays,
    cubeCycles: {
      [migratedCycle.id]: migratedCycle,
    },
    activeCubeCycleId: migratedCycle.id,
    reports: raw.reports ?? {},
  };
}

function completeActiveCubeCycle(state: AppState, reason: CubeCycle["completionReason"], completedAt = TODAY()) {
  const active = state.cubeCycles[state.activeCubeCycleId];
  if (!active || active.status === "completed") return state;
  const nextCycle = makeCubeCycle(completedAt);
  return {
    ...state,
    activeCubeCycleId: nextCycle.id,
    cubeCycles: {
      ...state.cubeCycles,
      [active.id]: {
        ...active,
        status: "completed" as const,
        completionReason: reason,
        completedAt,
      },
      [nextCycle.id]: nextCycle,
    },
  };
}

function rotateCubeByDate(state: AppState, today = TODAY()) {
  const active = state.cubeCycles[state.activeCubeCycleId];
  if (!active) {
    const cycle = makeCubeCycle(today);
    return {
      ...state,
      activeCubeCycleId: cycle.id,
      cubeCycles: {
        ...state.cubeCycles,
        [cycle.id]: cycle,
      },
    };
  }
  if (active.status === "active" && today >= active.endsAt) {
    return completeActiveCubeCycle(state, "ten-day-cycle", today);
  }
  return state;
}

function attachEventToCubeCycle(state: AppState, event: XpEvent) {
  let next = rotateCubeByDate(state, event.date);
  const active = next.cubeCycles[next.activeCubeCycleId];
  const plateCount = active.plateCount + platesForXp(event.amount);
  next = {
    ...next,
    cubeCycles: {
      ...next.cubeCycles,
      [active.id]: {
        ...active,
        eventIds: [...active.eventIds, event.id],
        plateCount,
      },
    },
  };
  if (plateCount >= CUBE_CAPACITY) {
    return completeActiveCubeCycle(next, "cube-full", event.date);
  }
  return next;
}

function eventsForCycle(state: AppState, cycleId: string) {
  const cycle = state.cubeCycles[cycleId];
  if (!cycle) return [];
  const byId = new Map(allEvents(state.days).map((event) => [event.id, event]));
  return cycle.eventIds.map((id) => byId.get(id)).filter((event): event is XpEvent => Boolean(event));
}

function buildDayReport(record: DayRecord): DayReport {
  const wins = record.events.filter((event) => event.amount > 0).length;
  const losses = record.events.filter((event) => event.amount < 0).length;
  const statements: string[] = [];
  if (record.leaveRequest) {
    statements.push("Harsh went on a leave today.");
  }
  for (const checkpost of record.checkposts) {
    if (checkpost.status === "won") {
      statements.push(`Harsh did ${checkpost.name} today for ${checkpost.loggedMinutes} mins and succeeded.`);
    }
    if (checkpost.status === "lost") {
      const eventReason = record.events.find((event) => event.entityId === checkpost.id && event.reason)?.reason;
      const reason = eventReason || "the field was not held";
      statements.push(`Harsh did ${checkpost.name} today for ${checkpost.loggedMinutes} mins but could not succeed because ${reason}.`);
    }
    if (checkpost.status === "given-up") {
      statements.push(`Harsh did not do ${checkpost.name} today.`);
    }
  }
  for (const boss of record.bosses) {
    if (boss.status === "defeated") {
      statements.push(`Harsh defeated ${boss.name} after logging ${boss.loggedMinutes} mins.`);
    }
    if (boss.status === "given-up") {
      statements.push(`Harsh gave up ${boss.name}.`);
    }
  }
  return {
    date: record.date,
    generatedAt: new Date().toISOString(),
    title: record.xpDelta >= 0 ? "The Field Was Held" : "Ground Was Lost",
    summary: `XP ${record.xpDelta >= 0 ? "+" : ""}${record.xpDelta}. Wins ${wins}. Losses ${losses}.`,
    statements,
    xpDelta: record.xpDelta,
    wins,
    losses,
  };
}

function withReportForDate(state: AppState, date: string) {
  const record = state.days[date];
  if (!record) return state;
  return {
    ...state,
    reports: {
      ...state.reports,
      [date]: buildDayReport(record),
    },
  };
}

function enrichDemoContent(record: DayRecord): DayRecord {
  let changed = false;
  const bosses = record.bosses
    .filter((item) => !item.id.startsWith("seed-boss-"))
    .map((item, index) => {
      const image = item.image || (index === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp");
      if (item.image !== image || item.coordinateIndex !== index) changed = true;
      return { ...item, image, coordinateIndex: index };
    })
    .slice(0, 2);
  if (bosses.length !== record.bosses.length) changed = true;
  if (!changed) return record;
  return {
    ...record,
    bosses,
  };
}

function priorityLabel(priority: Priority) {
  return priority === "routine" ? "Routine" : priority[0].toUpperCase() + priority.slice(1);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type AmbientRuntime = {
  context: AudioContext;
  master: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
};

function makeNoiseBuffer(context: AudioContext, seconds: number, intensity = 1) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = (Math.random() * 2 - 1) * intensity;
    last = last * 0.985 + white * 0.015;
    data[index] = last;
  }
  return buffer;
}

function startAmbientTrack(trackId: AmbientTrackId, volume: number): AmbientRuntime | null {
  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);

  const runtime: AmbientRuntime = { context, master, sources: [], nodes: [master] };
  const addSource = (source: AudioScheduledSourceNode) => {
    runtime.sources.push(source);
    source.start();
  };
  const connect = (node: AudioNode) => {
    runtime.nodes.push(node);
    return node;
  };
  const createDrone = (frequency: number, gainValue: number, type: OscillatorType = "sine") => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = connect(context.createGain()) as GainNode;
    gain.gain.value = gainValue;
    oscillator.connect(gain).connect(master);
    addSource(oscillator);
  };
  const createNoise = (filterType: BiquadFilterType, frequency: number, gainValue: number, seconds = 7) => {
    const noise = context.createBufferSource();
    noise.buffer = makeNoiseBuffer(context, seconds, 0.95);
    noise.loop = true;
    const filter = connect(context.createBiquadFilter()) as BiquadFilterNode;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = trackId === "rain-keep" ? 0.7 : 0.28;
    const gain = connect(context.createGain()) as GainNode;
    gain.gain.value = gainValue;
    noise.connect(filter).connect(gain).connect(master);
    addSource(noise);
  };
  const createBell = (frequency: number, delay: number) => {
    const bell = context.createOscillator();
    bell.type = "sine";
    bell.frequency.value = frequency;
    const gain = connect(context.createGain()) as GainNode;
    gain.gain.setValueAtTime(0, context.currentTime);
    for (let step = 0; step < 600; step += 18) {
      const at = context.currentTime + delay + step;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 4.8);
    }
    bell.connect(gain).connect(master);
    addSource(bell);
  };

  if (trackId === "rain-keep") {
    createNoise("lowpass", 850, 0.42, 9);
    createNoise("bandpass", 1800, 0.13, 5);
    createDrone(55, 0.045);
    createDrone(82.41, 0.028);
  }

  if (trackId === "temple-depths") {
    createNoise("lowpass", 260, 0.12, 11);
    createDrone(48.99, 0.065);
    createDrone(73.42, 0.038);
    createBell(392, 3);
    createBell(523.25, 11);
  }

  if (trackId === "night-wind") {
    createNoise("lowpass", 520, 0.2, 13);
    createNoise("highpass", 1200, 0.035, 8);
    createDrone(43.65, 0.045);
    createDrone(65.41, 0.03);
  }

  if (trackId === "ember-hall") {
    createNoise("lowpass", 420, 0.18, 8);
    createNoise("bandpass", 95, 0.09, 5);
    createDrone(61.74, 0.045);
    createDrone(92.5, 0.028, "triangle");
  }

  if (trackId === "deep-ocean") {
    createNoise("lowpass", 310, 0.24, 14);
    createNoise("bandpass", 120, 0.14, 11);
    createDrone(36.71, 0.05);
    createDrone(55, 0.024);
  }

  if (trackId === "brown-noise") {
    createNoise("lowpass", 240, 0.38, 12);
    createDrone(50, 0.018);
  }

  return runtime;
}

function stopAmbientRuntime(runtime: AmbientRuntime | null, fadeMs = 0) {
  if (!runtime) return;
  const close = () => {
    runtime.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already be stopped when switching tracks quickly.
      }
    });
    runtime.nodes.forEach((node) => node.disconnect());
    void runtime.context.close().catch(() => undefined);
  };

  if (fadeMs > 0 && runtime.context.state !== "closed") {
    const now = runtime.context.currentTime;
    runtime.master.gain.cancelScheduledValues(now);
    runtime.master.gain.setValueAtTime(runtime.master.gain.value, now);
    runtime.master.gain.linearRampToValueAtTime(0.0001, now + fadeMs / 1000);
    window.setTimeout(close, fadeMs + 40);
    return;
  }

  close();
}

function readAmbientPreferences() {
  const fallback: { trackId: AmbientTrackId; volume: number } = { trackId: "rain-keep", volume: 0.22 };
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(AMBIENT_STORAGE_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored) as { trackId?: AmbientTrackId; volume?: number };
    return {
      trackId: parsed.trackId && AMBIENT_TRACKS.some((item) => item.id === parsed.trackId) ? parsed.trackId : fallback.trackId,
      volume: typeof parsed.volume === "number" ? Math.min(0.6, Math.max(0, parsed.volume)) : fallback.volume,
    };
  } catch {
    return fallback;
  }
}

function readRewardSoundMuted() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REWARD_SOUND_STORAGE_KEY) === "muted";
}

export default function Home() {
  const [state, setState] = useState<AppState>(defaultState);
  const rewardAudioRef = useRef<HTMLAudioElement | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"cube" | "war" | "reports">("cube");
  const [frontIndex, setFrontIndex] = useState(0);
  const [urgeMode, setUrgeMode] = useState<UrgeOutcome | null>(null);
  const [selectedCheckpostId, setSelectedCheckpostId] = useState<string | null>(null);
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null);
  const [addingFront, setAddingFront] = useState<FrontId | null>(null);
  const [timerTarget, setTimerTarget] = useState<{ kind: "checkpost" | "boss"; id: string; name: string; minutes: number } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pulse, setPulse] = useState<"gain" | "loss" | "level" | null>(null);
  const [rewardMuted, setRewardMuted] = useState(false);
  const [rewardPlaying, setRewardPlaying] = useState(false);

  const date = TODAY();
  const day = todayRecord(state, date);
  const level = useMemo(() => levelFromXp(state.totalXp), [state.totalXp]);
  const fronts: FrontId[] = ["routine", "priorities", "boss"];
  const activeFront = fronts[frontIndex];
  const cubeEvents = useMemo(() => eventsForCycle(state, state.activeCubeCycleId), [state]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AppState;
          setState(ensureToday(migrateState(parsed)));
        } catch {
          setState(defaultState());
        }
      }
      setRewardMuted(readRewardSoundMuted());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [hydrated, state]);

  useEffect(() => {
    window.localStorage.setItem(REWARD_SOUND_STORAGE_KEY, rewardMuted ? "muted" : "enabled");
    if (rewardMuted && rewardAudioRef.current) {
      rewardAudioRef.current.pause();
      rewardAudioRef.current.currentTime = 0;
      setRewardPlaying(false);
    }
  }, [rewardMuted]);

  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(null), 900);
    return () => window.clearTimeout(id);
  }, [pulse]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => approveDueLeave(evaluatePastDays(ensureToday(current))));
    }, 30_000);
    return () => window.clearInterval(id);
    // The interval always uses the latest state via the setState callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureToday(current: AppState) {
    current = rotateCubeByDate(current);
    const today = TODAY();
    if (current.days[today]) {
      const enriched = enrichDemoContent(current.days[today]);
      return enriched === current.days[today]
        ? current
        : {
            ...current,
            days: {
              ...current.days,
              [today]: enriched,
            },
          };
    }
    return {
      ...current,
      days: {
        ...current.days,
        [today]: {
          date: today,
          xpDelta: 0,
          events: [],
          checkposts: seedCheckposts(),
          bosses: [],
          evaluated: false,
        },
      },
    };
  }

  function approveDueLeave(current: AppState) {
    const nextDays = { ...current.days };
    let changed = false;
    for (const record of Object.values(nextDays)) {
      if (record.leaveRequest && Date.now() >= record.leaveRequest.approvedAt && !record.leaveRequest.reason.endsWith(" approved")) {
        nextDays[record.date] = {
          ...record,
          leaveRequest: { ...record.leaveRequest, reason: `${record.leaveRequest.reason} approved` },
        };
        changed = true;
      }
    }
    return changed ? { ...current, days: nextDays } : current;
  }

  function evaluatePastDays(current: AppState) {
    const today = TODAY();
    let next = current;
    for (const record of Object.values(current.days)) {
      if (record.date >= today || record.evaluated) continue;
      const approvedLeave = record.leaveRequest && Date.now() >= record.leaveRequest.approvedAt;
      if (approvedLeave) {
        next = {
          ...next,
          days: {
            ...next.days,
            [record.date]: { ...record, evaluated: true },
          },
        };
        continue;
      }
      for (const checkpost of record.checkposts.filter((item) => item.status === "pending")) {
        next = applyXp(next, record.date, PRIORITY_XP[checkpost.priority].miss, `Missed ${checkpost.name}`, "midnight-evaluation", false);
        const updated = todayRecord(next, record.date);
        next = {
          ...next,
          days: {
            ...next.days,
            [record.date]: {
              ...updated,
              evaluated: true,
              checkposts: updated.checkposts.map((item) => (item.id === checkpost.id ? { ...item, status: "lost" } : item)),
            },
          },
        };
        next = withReportForDate(next, record.date);
      }
      const latest = todayRecord(next, record.date);
      if (!latest.evaluated) {
        next = {
          ...next,
          days: {
            ...next.days,
            [record.date]: { ...latest, evaluated: true },
          },
        };
        next = withReportForDate(next, record.date);
      }
    }
    return next;
  }

  function playVictorySound() {
    if (rewardMuted) return;
    if (!rewardAudioRef.current) {
      const audio = new Audio("/assets/victory.mp3");
      audio.volume = 0.55;
      audio.addEventListener("ended", () => setRewardPlaying(false));
      audio.addEventListener("pause", () => {
        if (audio.currentTime === 0 || audio.ended) setRewardPlaying(false);
      });
      rewardAudioRef.current = audio;
    }

    const audio = rewardAudioRef.current;
    if (!audio.paused && !audio.ended) return;
    audio.currentTime = 0;
    setRewardPlaying(true);
    void audio.play().catch(() => setRewardPlaying(false));
  }

  function stopRewardSound() {
    if (!rewardAudioRef.current) return;
    rewardAudioRef.current.pause();
    rewardAudioRef.current.currentTime = 0;
    setRewardPlaying(false);
  }

  function applyXp(current: AppState, targetDate: string, amount: number, label: string, source: string, animate = true, metadata: Partial<XpEvent> = {}) {
    const record = todayRecord(current, targetDate);
    const event: XpEvent = {
      id: crypto.randomUUID(),
      date: targetDate,
      label,
      amount,
      source,
      ...metadata,
    };
    const beforeLevel = levelFromXp(current.totalXp).level;
    const totalXp = Math.max(0, current.totalXp + amount);
    const afterLevel = levelFromXp(totalXp).level;
    if (animate) {
      setPulse(afterLevel > beforeLevel ? "level" : amount >= 0 ? "gain" : "loss");
    }
    if (animate && amount > 0) {
      playVictorySound();
    }
    return withReportForDate(attachEventToCubeCycle({
      ...current,
      totalXp,
      days: {
        ...current.days,
        [targetDate]: {
          ...record,
          xpDelta: record.xpDelta + amount,
          events: [event, ...record.events],
        },
      },
    }, event), targetDate);
  }

  function mutateToday(mutator: (record: DayRecord) => DayRecord) {
    setState((current) => {
      const base = ensureToday(current);
      const record = todayRecord(base, date);
      return {
        ...base,
        days: {
          ...base.days,
          [date]: mutator(record),
        },
      };
    });
  }

  function logUrge(outcome: UrgeOutcome, strength: UrgeStrength) {
    const amount = URGE_XP[outcome][strength];
    setState((current) =>
      applyXp(ensureToday(current), date, amount, `${outcome === "beat" ? "Beat" : "Lost to"} ${strength} urge`, "urge", true, {
        outcome: outcome === "beat" ? "win" : "loss",
        entityName: `${strength} urge`,
      }),
    );
    setUrgeMode(null);
  }

  function resolveCheckpost(id: string, status: "won" | "lost") {
    const checkpost = day.checkposts.find((item) => item.id === id);
    if (!checkpost || checkpost.status !== "pending") return;
    const reason = status === "lost" ? window.prompt("Why was this checkpost lost?")?.trim() : undefined;
    const amount = status === "won" ? PRIORITY_XP[checkpost.priority].win : PRIORITY_XP[checkpost.priority].miss;
    setState((current) => {
      let next = applyXp(
        ensureToday(current),
        date,
        amount,
        `${status === "won" ? "Captured" : "Lost"} ${checkpost.name}`,
        "checkpost",
        true,
        {
          minutes: checkpost.loggedMinutes,
          outcome: status === "won" ? "win" : "loss",
          reason,
          entityId: checkpost.id,
          entityName: checkpost.name,
        },
      );
      const record = todayRecord(next, date);
      next = {
        ...next,
        days: {
          ...next.days,
          [date]: {
            ...record,
            checkposts: record.checkposts.map((item) => (item.id === id ? { ...item, status } : item)),
          },
        },
      };
      return withReportForDate(next, date);
    });
  }

  function giveUpCheckpost(id: string) {
    setState((current) => {
      const base = ensureToday(current);
      const record = todayRecord(base, date);
      return withReportForDate({
        ...base,
        days: {
          ...base.days,
          [date]: {
            ...record,
            checkposts: record.checkposts.map((item) => (item.id === id ? { ...item, status: "given-up" } : item)),
          },
        },
      }, date);
    });
    setSelectedCheckpostId(null);
  }

  function addCheckpost(front: FrontId, draft: AddDraft) {
    mutateToday((record) => {
      if (front === "boss") {
        const activeBosses = record.bosses.filter((boss) => boss.status === "active");
        if (activeBosses.length >= 2) return record;
        const slot = activeBosses.length;
        return {
          ...record,
          bosses: [...record.bosses, makeBoss(draft.name, draft.allottedMinutes, draft.description, slot, crypto.randomUUID(), slot === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp")],
        };
      }

      const frontItems = record.checkposts.filter((item) => item.front === front && item.status === "pending");
      if (front === "routine" && frontItems.length >= 10) return record;
      if (front === "priorities") {
        if (frontItems.length >= 8) return record;
        const counts = {
          high: frontItems.filter((item) => item.priority === "high").length,
          medium: frontItems.filter((item) => item.priority === "medium").length,
          low: frontItems.filter((item) => item.priority === "low").length,
        };
        if (draft.priority === "high" && counts.high >= 2) return record;
        if (draft.priority === "medium" && counts.medium >= 4) return record;
        if (draft.priority === "low" && counts.low >= 2) return record;
      }

      return {
        ...record,
        checkposts: [
          ...record.checkposts,
          makeCheckpost(
            draft.name,
            front,
            front === "routine" ? "routine" : draft.priority,
            draft.allottedMinutes,
            draft.description,
            frontItems.length,
          ),
        ],
      };
    });
    setAddingFront(null);
  }

  function logTimer(kind: "checkpost" | "boss", id: string, minutes: number) {
    setState((current) => {
      const base = ensureToday(current);
      const record = todayRecord(base, date);
      let nextRecord: DayRecord;
      if (kind === "boss") {
        nextRecord = {
          ...record,
          bosses: record.bosses.map((boss) => (boss.id === id ? { ...boss, loggedMinutes: boss.loggedMinutes + minutes } : boss)),
        };
      } else {
        nextRecord = {
          ...record,
          checkposts: record.checkposts.map((item) => (item.id === id ? { ...item, loggedMinutes: item.loggedMinutes + minutes } : item)),
        };
      }
      return withReportForDate({
        ...base,
        days: {
          ...base.days,
          [date]: nextRecord,
        },
      }, date);
    });
  }
  function bossWorked(id: string, amount: 2 | 3) {
    const boss = day.bosses.find((item) => item.id === id);
    if (!boss || boss.workedDates[date]) return;
    setState((current) => {
      let next = applyXp(ensureToday(current), date, amount, `Worked on ${boss.name}`, "boss-progress", true, {
        minutes: boss.loggedMinutes,
        outcome: "progress",
        entityId: boss.id,
        entityName: boss.name,
      });
      const record = todayRecord(next, date);
      next = {
        ...next,
        days: {
          ...next.days,
          [date]: {
            ...record,
            bosses: record.bosses.map((item) => (item.id === id ? { ...item, workedDates: { ...item.workedDates, [date]: true } } : item)),
          },
        },
      };
      return withReportForDate(next, date);
    });
  }

  function resolveBoss(id: string, defeated: boolean) {
    const boss = day.bosses.find((item) => item.id === id && item.status === "active");
    if (!boss) return;
    setState((current) => {
      let next = applyXp(
        ensureToday(current),
        date,
        defeated ? 40 : -40,
        `${defeated ? "Defeated" : "Gave up"} ${boss.name}`,
        "boss-resolution",
        true,
        { outcome: defeated ? "win" : "give-up", entityId: boss.id, entityName: boss.name },
      );
      const record = todayRecord(next, date);
      next = {
        ...next,
        days: {
          ...next.days,
          [date]: {
            ...record,
            bosses: record.bosses.map((item) =>
              item.id === id ? { ...item, status: defeated ? "defeated" : "given-up", completedAt: date } : item,
            ),
          },
        },
      };
      return withReportForDate(next, date);
    });
    setSelectedBossId(null);
  }

  function fileLeave(reason: string, note: string) {
    setState((current) => {
      const base = ensureToday(current);
      const record = todayRecord(base, date);
      return withReportForDate({
        ...base,
        days: {
          ...base.days,
          [date]: {
            ...record,
            leaveRequest: {
              id: crypto.randomUUID(),
              date,
              reason,
              note,
              requestedAt: Date.now(),
              approvedAt: Date.now() + 10 * 60 * 1000,
            },
          },
        },
      }, date);
    });
    setLeaveOpen(false);
  }

  const selectedCheckpost = day.checkposts.find((item) => item.id === selectedCheckpostId);
  const selectedBoss = day.bosses.find((item) => item.id === selectedBossId && item.status === "active");

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070b] text-[#f8e9bd]">
      <div className="fixed inset-0 terrain-bg opacity-90" />
      <div className="fixed inset-0 smoke-screen" />
      <GlobalXpBar totalXp={state.totalXp} dayXp={day.xpDelta} level={level} pulse={pulse} />
      <AmbientMusicPlayer />
      <RewardSoundControl
        muted={rewardMuted}
        playing={rewardPlaying}
        onToggleMute={() => setRewardMuted((value) => !value)}
        onStop={stopRewardSound}
      />

      <div className="relative z-10 min-h-screen">
        {view === "cube" ? (
          <section className="landing-stage">
            <div className="app-nav app-nav-home">
              <button className="war-button" onClick={() => setView("war")}>War Map</button>
              <button className="war-button" onClick={() => setView("reports")}>Reports</button>
            </div>
            <div className="landing-crest">
              <p>Willpower OS</p>
              <h1>Inner War</h1>
              <span>
                Hold the line. Reclaim the day.
              </span>
            </div>
            <DisciplineCube events={cubeEvents} />
            <div className="command-dock">
              <p>Commands</p>
              <div className="urge-controls">
              <button className="victory-button landing-action" onClick={() => setUrgeMode("beat")}>
                Held the Line
              </button>
              <button className="loss-button landing-action" onClick={() => setUrgeMode("lost")}>
                Yielded Ground
              </button>
              </div>
            </div>
            <LandingIntel events={day.events} onOpenWar={() => setView("war")} />
            <button className="leave-button" onClick={() => setLeaveOpen(true)}>Request Leave</button>
            {urgeMode && <UrgeActionMenu mode={urgeMode} onPick={(strength) => logUrge(urgeMode, strength)} onClose={() => setUrgeMode(null)} />}
          </section>
        ) : view === "war" ? (
          <section className="war-page">
            <div className="war-topbar">
              <button className="war-button" onClick={() => setView("cube")}>
                Cube
              </button>
              <button className="war-button" onClick={() => setView("reports")}>
                Reports
              </button>
              <div className="flex items-center gap-3">
                <button className="round-nav" onClick={() => setFrontIndex((frontIndex + 2) % 3)} aria-label="Previous front">
                  ‹
                </button>
                <div className="front-title">{frontTitle(activeFront)}</div>
                <button className="round-nav" onClick={() => setFrontIndex((frontIndex + 1) % 3)} aria-label="Next front">
                  ›
                </button>
              </div>
            </div>
            <WarFrontCarousel
              frontIndex={frontIndex}
              day={day}
              onSelectCheckpost={setSelectedCheckpostId}
              onSelectBoss={setSelectedBossId}
            />
            <button className="add-checkpost-button" onClick={() => setAddingFront(activeFront)}>
              Add Checkpost
            </button>
            <div className="front-command-dock">
              <button className="front-nav-button" onClick={() => setFrontIndex((frontIndex + 2) % 3)} aria-label="Previous front">
                Prev
              </button>
              <div className="front-title">{frontTitle(activeFront)}</div>
              <button className="front-nav-button" onClick={() => setFrontIndex((frontIndex + 1) % 3)} aria-label="Next front">
                Next
              </button>
            </div>
          </section>
        ) : (
          <ReportsScreen
            today={date}
            days={state.days}
            reports={state.reports}
            onCube={() => setView("cube")}
            onWar={() => setView("war")}
          />
        )}
      </div>

      {selectedCheckpost && (
        <CheckpostCommandPanel
          checkpost={selectedCheckpost}
          onClose={() => setSelectedCheckpostId(null)}
          onTimer={() => setTimerTarget({ kind: "checkpost", id: selectedCheckpost.id, name: selectedCheckpost.name, minutes: selectedCheckpost.allottedMinutes })}
          onWin={() => resolveCheckpost(selectedCheckpost.id, "won")}
          onLost={() => resolveCheckpost(selectedCheckpost.id, "lost")}
          onGiveUp={() => giveUpCheckpost(selectedCheckpost.id)}
        />
      )}

      {selectedBoss && (
        <BossCommandPanel
          boss={selectedBoss}
          workedToday={Boolean(selectedBoss.workedDates[date])}
          onClose={() => setSelectedBossId(null)}
          onTimer={() => setTimerTarget({ kind: "boss", id: selectedBoss.id, name: selectedBoss.name, minutes: selectedBoss.allottedMinutes })}
          onWorked={bossWorked}
          onDefeated={() => resolveBoss(selectedBoss.id, true)}
          onGiveUp={() => resolveBoss(selectedBoss.id, false)}
        />
      )}

      {addingFront && <AddCheckpostPanel front={addingFront} day={day} onClose={() => setAddingFront(null)} onAdd={(draft) => addCheckpost(addingFront, draft)} />}

      {timerTarget && (
        <FocusTimerOverlay
          target={timerTarget}
          onClose={(minutes) => {
            if (minutes > 0) logTimer(timerTarget.kind, timerTarget.id, minutes);
            setTimerTarget(null);
          }}
        />
      )}

      {leaveOpen && <LeaveRequestPanel existing={day.leaveRequest} onClose={() => setLeaveOpen(false)} onFile={fileLeave} />}
    </main>
  );
}

function AmbientMusicPlayer() {
  const runtimeRef = useRef<AmbientRuntime | null>(null);
  const loopStartedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [status, setStatus] = useState<AmbientStatus>("idle");
  const [trackId, setTrackId] = useState<AmbientTrackId>("rain-keep");
  const [volume, setVolume] = useState(0.22);
  const [progress, setProgress] = useState(0);
  const track = AMBIENT_TRACKS.find((item) => item.id === trackId) ?? AMBIENT_TRACKS[0];

  function stop(fadeMs = 500) {
    stopAmbientRuntime(runtimeRef.current, fadeMs);
    runtimeRef.current = null;
    setStatus("idle");
    accumulatedMsRef.current = 0;
    setProgress(0);
  }

  function begin(nextTrackId = trackId) {
    stopAmbientRuntime(runtimeRef.current, 650);
    const runtime = startAmbientTrack(nextTrackId, volume);
    if (!runtime) return;
    runtimeRef.current = runtime;
    loopStartedAtRef.current = Date.now();
    accumulatedMsRef.current = 0;
    setProgress(0);
    setStatus("playing");
  }

  function pause() {
    const runtime = runtimeRef.current;
    if (!runtime || status !== "playing") return;
    accumulatedMsRef.current = (accumulatedMsRef.current + Date.now() - loopStartedAtRef.current) % 600_000;
    runtime.master.gain.setTargetAtTime(0.0001, runtime.context.currentTime, 0.12);
    window.setTimeout(() => {
      void runtime.context.suspend().catch(() => undefined);
    }, 180);
    setStatus("paused");
  }

  function resume() {
    const runtime = runtimeRef.current;
    if (!runtime || status !== "paused") {
      begin();
      return;
    }
    loopStartedAtRef.current = Date.now();
    void runtime.context.resume().then(() => {
      runtime.master.gain.setTargetAtTime(volume, runtime.context.currentTime, 0.12);
      setStatus("playing");
    });
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      const preferences = readAmbientPreferences();
      setTrackId(preferences.trackId);
      setVolume(preferences.volume);
      setPreferencesHydrated(true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      stopAmbientRuntime(runtimeRef.current);
    };
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    window.localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify({ trackId, volume }));
  }, [preferencesHydrated, trackId, volume]);

  useEffect(() => {
    if (runtimeRef.current) {
      runtimeRef.current.master.gain.setTargetAtTime(volume, runtimeRef.current.context.currentTime, 0.05);
    }
  }, [volume]);

  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => {
      setProgress(((accumulatedMsRef.current + Date.now() - loopStartedAtRef.current) % 600_000) / 600_000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  return (
    <aside className={cx("ambient-player", status === "playing" && "ambient-playing", status === "paused" && "ambient-paused")}>
      <div className="ambient-orb" aria-hidden="true">
        <span />
      </div>
      <div className="ambient-main">
        <div className="ambient-header">
          <span>Focus Loop</span>
          <strong>{track.name}</strong>
        </div>
        <p>{track.subtitle}</p>
        <div className="ambient-progress">
          <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
        <div className="ambient-controls">
          <button className="ambient-play" onClick={() => (status === "playing" ? pause() : resume())}>
            {status === "playing" ? "Pause" : status === "paused" ? "Resume" : "Play"}
          </button>
          <select
            aria-label="Choose focus music"
            value={trackId}
            onChange={(event) => {
              const nextTrackId = event.target.value as AmbientTrackId;
              setTrackId(nextTrackId);
              if (status !== "idle") begin(nextTrackId);
            }}
          >
            {AMBIENT_TRACKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label>
            <span>Vol</span>
            <input
              type="range"
              min="0"
              max="0.6"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
          {status !== "idle" && (
            <button className="ambient-stop" onClick={() => stop()}>
              Stop
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function RewardSoundControl({
  muted,
  playing,
  onToggleMute,
  onStop,
}: {
  muted: boolean;
  playing: boolean;
  onToggleMute: () => void;
  onStop: () => void;
}) {
  return (
    <aside className={cx("reward-sound-control", playing && "reward-sound-playing", muted && "reward-sound-muted")}>
      <div>
        <span>Reward Sound</span>
        <strong>{muted ? "Muted" : playing ? "Playing" : "Armed"}</strong>
      </div>
      <button onClick={onToggleMute}>{muted ? "Unmute" : "Mute"}</button>
      {playing && (
        <button className="reward-stop" onClick={onStop}>
          Stop
        </button>
      )}
    </aside>
  );
}

function GlobalXpBar({
  totalXp,
  dayXp,
  level,
  pulse,
}: {
  totalXp: number;
  dayXp: number;
  level: ReturnType<typeof levelFromXp>;
  pulse: "gain" | "loss" | "level" | null;
}) {
  return (
    <header className={cx("xp-bar", pulse && `xp-${pulse}`)}>
      <div className="level-seal">
        <span>LVL</span>
        <strong>{level.level}</strong>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.24em] text-[#b99243]">
          <span>Command Ascension</span>
          <span>{totalXp} XP</span>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${level.percent}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-[#d9c18b]">
          <span>
            {level.progressXp} / {level.requiredXp}
          </span>
          <span className={dayXp >= 0 ? "text-[#8ee1a5]" : "text-[#ff7b6e]"}>Today {dayXp >= 0 ? "+" : ""}{dayXp}</span>
        </div>
      </div>
    </header>
  );
}

function DisciplineCube({ events }: { events: XpEvent[] }) {
  const marks = events
    .slice()
    .reverse()
    .flatMap((event) => {
      const plateCount = Math.max(1, Math.round(Math.abs(event.amount) / 5));
      return Array.from({ length: plateCount }, () => (event.amount >= 0 ? "won" : "lost"));
    });

  const cellsForFace = (faceIndex: number, face: string) => Array.from({ length: 81 }, (_, index) => {
    const linearIndex = faceIndex * 81 + index;
    const tone = marks[linearIndex] ?? "empty";
    return (
      <span key={`${face}-${index}`} className={cx("cube-cell", `cube-cell-${tone}`)}>
        <i />
      </span>
    );
  });

  return (
    <div className="cube-stage">
      <div className="cube-aura" />
      <div className="discipline-cube">
        {["front", "back", "right", "left", "top", "bottom"].map((face, faceIndex) => (
          <div key={face} className={`cube-face cube-face-${face}`}>
            {cellsForFace(faceIndex, face)}
          </div>
        ))}
      </div>
    </div>
  );
}

function UrgeActionMenu({ mode, onPick, onClose }: { mode: UrgeOutcome; onPick: (strength: UrgeStrength) => void; onClose: () => void }) {
  return (
    <div className="ritual-popover">
      <button className="panel-close" onClick={onClose}>×</button>
      <p className="panel-kicker">{mode === "beat" ? "Victory claim" : "Damage record"}</p>
      <h2>How strong was the urge?</h2>
      <div className="mt-5 grid gap-3">
        {(["vague", "medium", "strong"] as UrgeStrength[]).map((strength) => (
          <button key={strength} className="choice-row" onClick={() => onPick(strength)}>
            <span>{strength}</span>
            <strong>{URGE_XP[mode][strength] > 0 ? "+" : ""}{URGE_XP[mode][strength]} XP</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyLedger({ events }: { events: XpEvent[] }) {
  return (
    <aside className="daily-ledger">
      <p className="panel-kicker">Latest marks</p>
      {events.slice(0, 5).map((event) => (
        <div key={event.id} className="ledger-row">
          <span>{event.label}</span>
          <strong className={event.amount >= 0 ? "text-[#9be89d]" : "text-[#ff8173]"}>
            {event.amount > 0 ? "+" : ""}{event.amount}
          </strong>
        </div>
      ))}
      {events.length === 0 && <p className="text-sm text-[#8d7e65]">No marks on the field yet.</p>}
    </aside>
  );
}

function LandingIntel({ events, onOpenWar }: { events: XpEvent[]; onOpenWar: () => void }) {
  return (
    <aside className="landing-intel">
      <button className="map-preview" onClick={onOpenWar}>
        <span className="map-image" />
        <span className="map-copy">
          <strong>Enter Frontlines</strong>
          <em>Routine · Priority · Boss</em>
        </span>
      </button>
      <DailyLedger events={events} />
    </aside>
  );
}

function ReportsScreen({
  today,
  days,
  reports,
  onCube,
  onWar,
}: {
  today: string;
  days: Record<string, DayRecord>;
  reports: Record<string, DayReport>;
  onCube: () => void;
  onWar: () => void;
}) {
  const todayRecordForReport = days[today];
  const todayDraft = useMemo(() => (todayRecordForReport ? buildDayReport(todayRecordForReport) : undefined), [todayRecordForReport]);
  const reportMap = useMemo(
    () => ({
      ...reports,
      ...(todayDraft && !reports[today] ? { [today]: { ...todayDraft, title: `${todayDraft.title} · In Progress` } } : {}),
    }),
    [reports, today, todayDraft],
  );
  const reportDates = useMemo(() => Object.keys(reportMap).sort((a, b) => b.localeCompare(a)), [reportMap]);
  const [selectedDate, setSelectedDate] = useState(reportDates[0] ?? today);
  const effectiveSelectedDate = reportMap[selectedDate] ? selectedDate : reportDates[0];
  const selectedReport = effectiveSelectedDate ? reportMap[effectiveSelectedDate] : undefined;
  const selectedDay = effectiveSelectedDate ? days[effectiveSelectedDate] : undefined;
  const isDraft = effectiveSelectedDate === today && !reports[today];

  return (
    <section className="reports-screen">
      <div className="reports-topbar">
        <button className="war-button" onClick={onCube}>Cube</button>
        <button className="war-button" onClick={onWar}>War Map</button>
      </div>
      <div className="reports-shell">
        <ArchiveFrameSvg />
        <aside className="report-days">
          <p className="panel-kicker">Battle Archive</p>
          <h2>Reports</h2>
          <div className="report-day-list">
            {reportDates.map((date) => (
              <button
                key={date}
                className={cx("report-day-button", effectiveSelectedDate === date && "active")}
                onClick={() => setSelectedDate(date)}
              >
                <span className="timeline-dot" />
                <strong>{date}</strong>
                <em>{date === today && !reports[today] ? "In Progress" : "Day Closed"}</em>
              </button>
            ))}
          </div>
        </aside>
        <article className="report-detail">
          {selectedReport ? (
            <>
              <div className="report-seal"><BattleSealSvg /></div>
              <p className="panel-kicker">{isDraft ? "Live Draft" : "Closed Record"}</p>
              <h1>{selectedReport.title}</h1>
              <div className="report-stats">
                <span>{selectedReport.date}</span>
                <span>{selectedReport.xpDelta >= 0 ? "+" : ""}{selectedReport.xpDelta} XP</span>
                <span>{selectedReport.wins} wins</span>
                <span>{selectedReport.losses} losses</span>
              </div>
              {selectedDay?.leaveRequest && (
                <p className="report-leave">Leave: {selectedDay.leaveRequest.reason.replace(" approved", "")}</p>
              )}
              <p className="report-summary">{selectedReport.summary}</p>
              <div className="rune-divider" />
              <ul className="statement-log">
                {selectedReport.statements.length > 0 ? (
                  selectedReport.statements.map((statement, index) => <li key={`${selectedReport.date}-${index}`}>{statement}</li>)
                ) : (
                  <li>No statements recorded yet. Mark wins, losses, leave, or boss work to write the field record.</li>
                )}
              </ul>
            </>
          ) : (
            <div className="reports-empty">
              <EmptySigilSvg />
              <h1>No Battle Reports</h1>
              <p>No battle reports recorded yet.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function ArchiveFrameSvg() {
  return (
    <svg className="archive-frame-svg" viewBox="0 0 1200 760" aria-hidden="true">
      <defs>
        <linearGradient id="archiveStroke" x1="0" x2="1">
          <stop offset="0" stopColor="#6ad5f4" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#d79b35" stopOpacity="0.5" />
          <stop offset="1" stopColor="#6ad5f4" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d="M36 34 H1164 V726 H36 Z" fill="none" stroke="url(#archiveStroke)" strokeWidth="2" />
      <path d="M74 72 H1126 V688 H74 Z" fill="none" stroke="#9d6f31" strokeOpacity="0.22" />
      <path d="M118 110 C230 86 292 128 404 108 C522 86 660 86 788 108 C908 130 1000 88 1084 116" fill="none" stroke="#6ad5f4" strokeOpacity="0.12" />
      <path d="M112 650 C262 614 398 680 568 642 C742 604 872 678 1086 632" fill="none" stroke="#d79b35" strokeOpacity="0.14" />
      {[180, 300, 420, 540, 660, 780, 900, 1020].map((x) => (
        <path key={x} d={`M${x} 78 V682`} stroke="#ffffff" strokeOpacity="0.035" />
      ))}
    </svg>
  );
}

function BattleSealSvg() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="#d79b35" strokeWidth="3" />
      <path d="M50 16 L60 40 L86 40 L65 56 L74 82 L50 66 L26 82 L35 56 L14 40 L40 40 Z" fill="none" stroke="#78d8f5" strokeWidth="3" />
      <circle cx="50" cy="50" r="8" fill="#78d8f5" opacity="0.55" />
    </svg>
  );
}

function EmptySigilSvg() {
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <circle cx="80" cy="80" r="58" fill="none" stroke="#6f8790" strokeWidth="2" strokeDasharray="8 10" />
      <path d="M80 28 L112 80 L80 132 L48 80 Z" fill="none" stroke="#d79b35" strokeOpacity="0.5" strokeWidth="3" />
      <path d="M52 80 H108 M80 52 V108" stroke="#6ad5f4" strokeOpacity="0.35" strokeWidth="3" />
    </svg>
  );
}

function WarFrontCarousel({
  frontIndex,
  day,
  onSelectCheckpost,
  onSelectBoss,
}: {
  frontIndex: number;
  day: DayRecord;
  onSelectCheckpost: (id: string) => void;
  onSelectBoss: (id: string) => void;
}) {
  return (
    <div className="war-window">
      <div className="front-strip" style={{ transform: `translateX(-${frontIndex * 100}%)` }}>
        <WarFront front="routine" day={day} onSelectCheckpost={onSelectCheckpost} onSelectBoss={onSelectBoss} />
        <WarFront front="priorities" day={day} onSelectCheckpost={onSelectCheckpost} onSelectBoss={onSelectBoss} />
        <WarFront front="boss" day={day} onSelectCheckpost={onSelectCheckpost} onSelectBoss={onSelectBoss} />
      </div>
    </div>
  );
}

function WarFront({
  front,
  day,
  onSelectCheckpost,
  onSelectBoss,
}: {
  front: FrontId;
  day: DayRecord;
  onSelectCheckpost: (id: string) => void;
  onSelectBoss: (id: string) => void;
}) {
  const coords = front === "routine" ? ROUTINE_COORDS : front === "priorities" ? PRIORITY_COORDS : BOSS_COORDS;
  const checkposts = day.checkposts.filter((item) => item.front === front);
  const bosses = day.bosses.filter((boss) => boss.status === "active").slice(0, 2);

  return (
    <section className={cx("war-front", `war-front-${front}`)}>
      <div className="map-ridges" />
      <div className="front-label">
        <p>{frontTitle(front)}</p>
        <span>{frontSubline(front)}</span>
      </div>
      {front === "boss" ? (
        <div className="boss-faceoff">
          {[0, 1].map((slot) => {
            const boss = bosses[slot];
            return boss ? (
              <button key={boss.id} className="boss-card boss-card-active" onClick={() => onSelectBoss(boss.id)}>
                <span className="boss-card-aura" />
                <span className="boss-card-image" style={{ backgroundImage: `url(${boss.image})` }} />
                <span className="boss-card-copy">
                  <strong>{boss.name}</strong>
                  <em>{boss.loggedMinutes} min logged</em>
                </span>
              </button>
            ) : (
              <span key={`empty-boss-${slot}`} className="boss-card boss-card-empty">
                <span className="boss-card-image dormant" style={{ backgroundImage: `url(${slot === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp"})` }} />
                <span className="boss-card-copy">
                  <strong>Boss Chamber {slot + 1}</strong>
                  <em>Assign a boss task to awaken it</em>
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <>
          {coords.map((coord, index) => {
            const checkpost = checkposts.find((item) => item.coordinateIndex === index);
            if (checkpost) {
              return <MapCheckpost key={checkpost.id} coord={coord} label={checkpost.name} status={checkpost.status} onClick={() => onSelectCheckpost(checkpost.id)} />;
            }
            return <span key={index} className="empty-coordinate" style={{ left: `${coord.x}%`, top: `${coord.y}%` }} />;
          })}
        </>
      )}
    </section>
  );
}

function MapCheckpost({
  coord,
  label,
  status,
  image,
  onClick,
}: {
  coord: { x: number; y: number };
  label: string;
  status: CheckpostStatus | "boss";
  image?: string;
  onClick: () => void;
}) {
  return (
    <button className={cx("map-checkpost", `checkpost-${status}`)} style={{ left: `${coord.x}%`, top: `${coord.y}%` }} onClick={onClick}>
      {image ? <span className="boss-portrait" style={{ backgroundImage: `url(${image})` }} /> : <span className="checkpost-pin" />}
      <span className="checkpost-name">{label}</span>
    </button>
  );
}

function CheckpostCommandPanel({
  checkpost,
  onClose,
  onTimer,
  onWin,
  onLost,
  onGiveUp,
}: {
  checkpost: Checkpost;
  onClose: () => void;
  onTimer: () => void;
  onWin: () => void;
  onLost: () => void;
  onGiveUp: () => void;
}) {
  const score = PRIORITY_XP[checkpost.priority];
  return (
    <CommandPanel onClose={onClose} kicker="Checkpost">
      <h2>{checkpost.name}</h2>
      <InfoGrid
        rows={[
          ["Type", priorityLabel(checkpost.priority)],
          ["Victory", `+${score.win} XP`],
          ["Loss", `${score.miss} XP`],
          ["Allotted", `${checkpost.allottedMinutes} min`],
          ["Logged", `${checkpost.loggedMinutes} min`],
          ["Status", checkpost.status],
        ]}
      />
      <p className="mt-4 text-sm leading-6 text-[#b9aa86]">{checkpost.description || "No field note added."}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="panel-action" onClick={onTimer}>Start Timer</button>
        <button className="panel-action" onClick={onGiveUp}>Give Up</button>
        <button className="victory-button small" disabled={checkpost.status !== "pending"} onClick={onWin}>Victory</button>
        <button className="loss-button small" disabled={checkpost.status !== "pending"} onClick={onLost}>Lost</button>
      </div>
    </CommandPanel>
  );
}

function BossCommandPanel({
  boss,
  workedToday,
  onClose,
  onTimer,
  onWorked,
  onDefeated,
  onGiveUp,
}: {
  boss: BossBattle;
  workedToday: boolean;
  onClose: () => void;
  onTimer: () => void;
  onWorked: (id: string, amount: 2 | 3) => void;
  onDefeated: () => void;
  onGiveUp: () => void;
}) {
  return (
    <CommandPanel onClose={onClose} kicker="Boss Battle">
      <h2>{boss.name}</h2>
      <InfoGrid
        rows={[
          ["Progress", workedToday ? "Worked today" : "Untouched today"],
          ["Final Victory", "+40 XP"],
          ["Give Up", "-40 XP"],
          ["Allotted", `${boss.allottedMinutes} min`],
          ["Logged", `${boss.loggedMinutes} min`],
        ]}
      />
      <p className="mt-4 text-sm leading-6 text-[#b9aa86]">{boss.description || "A long war. Choose it carefully."}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="panel-action" onClick={onTimer}>Start Timer</button>
        <button className="panel-action" disabled={workedToday} onClick={() => onWorked(boss.id, boss.loggedMinutes >= boss.allottedMinutes ? 3 : 2)}>
          Worked Today
        </button>
        <button className="victory-button small" onClick={onDefeated}>Defeated</button>
        <button className="loss-button small" onClick={onGiveUp}>Give Up</button>
      </div>
    </CommandPanel>
  );
}

function CommandPanel({ children, kicker, onClose }: { children: ReactNode; kicker: string; onClose: () => void }) {
  return (
    <aside className="command-panel">
      <button className="panel-close" onClick={onClose}>×</button>
      <p className="panel-kicker">{kicker}</p>
      {children}
    </aside>
  );
}

function AddCheckpostPanel({ front, day, onClose, onAdd }: { front: FrontId; day: DayRecord; onClose: () => void; onAdd: (draft: AddDraft) => void }) {
  const defaultPriority: Priority = front === "priorities" ? "high" : "routine";
  const [draft, setDraft] = useState<AddDraft>({ name: "", allottedMinutes: 30, priority: defaultPriority, description: "" });
  const limitText = front === "routine" ? `${day.checkposts.filter((item) => item.front === "routine" && item.status === "pending").length}/10 routine` : front === "priorities" ? priorityUsage(day) : `${day.bosses.filter((boss) => boss.status === "active").length}/2 bosses`;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onAdd({ ...draft, name: draft.name.trim(), allottedMinutes: Math.max(1, draft.allottedMinutes) });
  }

  return (
    <aside className="command-panel left-panel">
      <button className="panel-close" onClick={onClose}>×</button>
      <p className="panel-kicker">Add Checkpost</p>
      <h2>{frontTitle(front)}</h2>
      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#b99243]">{limitText}</p>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <label className="field-label">
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Outpost name" />
        </label>
        <label className="field-label">
          Time allotted
          <input type="number" min={1} value={draft.allottedMinutes} onChange={(event) => setDraft({ ...draft, allottedMinutes: Number(event.target.value) })} />
        </label>
        {front === "priorities" && (
          <label className="field-label">
            Priority
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        )}
        <label className="field-label">
          Field note
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What makes this checkpost matter?" />
        </label>
        <button className="victory-button small" type="submit">Place Checkpost</button>
      </form>
    </aside>
  );
}

function FocusTimerOverlay({
  target,
  onClose,
}: {
  target: { kind: "checkpost" | "boss"; id: string; name: string; minutes: number };
  onClose: (loggedMinutes: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = (elapsed % 60).toString().padStart(2, "0");
  const loggedMinutes = Math.ceil(elapsed / 60);

  return (
    <div className="timer-overlay">
      <div className="timer-scene">
        <p className="panel-kicker">Quiet Front</p>
        <h2>{target.name}</h2>
        <div className="timer-readout">{elapsedMinutes}<span>:{elapsedSeconds}</span></div>
        <p className="timer-unit">minutes elapsed</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="panel-action" onClick={() => setRunning(!running)}>{running ? "Pause" : "Resume"}</button>
          <button className="panel-action" onClick={() => setElapsed((value) => value + 300)}>Add 5 min</button>
          <button className="panel-action" onClick={() => setElapsed((value) => value + 600)}>Add 10 min</button>
          <button className="victory-button small" onClick={() => onClose(loggedMinutes)}>Finish</button>
        </div>
      </div>
    </div>
  );
}

function LeaveRequestPanel({ existing, onClose, onFile }: { existing?: LeaveRequest; onClose: () => void; onFile: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState(LEAVE_REASONS[0]);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);
  const approved = existing && now >= existing.approvedAt;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timeoutId = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <aside className="leave-panel">
      <button className="panel-close" onClick={onClose}>×</button>
      <p className="panel-kicker">Leave Docket</p>
      <h2>File for Leave</h2>
      {existing ? (
        <div className="mt-5 rounded border border-[#8e6a2c]/50 bg-black/20 p-4 text-sm text-[#d8c39a]">
          <p>Status: {approved ? "Approved" : "Auto-accepting in progress"}</p>
          <p className="mt-2">Reason: {existing.reason.replace(" approved", "")}</p>
          {existing.note && <p className="mt-2">Note: {existing.note}</p>}
        </div>
      ) : (
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onFile(reason, note);
          }}
        >
          <label className="field-label">
            Reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {LEAVE_REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field-label">
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why should the pending field be written off?" />
          </label>
          <button className="victory-button small" type="submit">Send Docket</button>
        </form>
      )}
    </aside>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function frontTitle(front: FrontId) {
  if (front === "routine") return "Daily Routine";
  if (front === "priorities") return "Daily Priorities";
  return "Boss Battle";
}

function frontSubline(front: FrontId) {
  if (front === "routine") return "Small forts that hold the day together.";
  if (front === "priorities") return "Eight checkposts: 2 high, 4 medium, 2 low.";
  return "Long wars. No daily penalty. Surrender costs dearly.";
}

function priorityUsage(day: DayRecord) {
  const items = day.checkposts.filter((item) => item.front === "priorities" && item.status === "pending");
  const count = (priority: Priority) => items.filter((item) => item.priority === priority).length;
  return `${items.length}/8 total · H ${count("high")}/2 · M ${count("medium")}/4 · L ${count("low")}/2`;
}
