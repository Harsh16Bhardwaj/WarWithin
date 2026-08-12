"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type UrgeStrength = "vague" | "medium" | "strong";
type UrgeOutcome = "beat" | "lost";
type FrontId = "routine" | "priorities" | "boss";
type CheckpostStatus = "pending" | "won" | "lost" | "given-up";
type BossStatus = "active" | "defeated" | "given-up" | "archived";
type Priority = "routine" | "high" | "medium" | "low";
type AppView = "cube" | "war" | "reports" | "profile";

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

type PlayerProfile = {
  displayName: string;
  handle: string;
  motto: string;
  joinedAt: string;
};

type ProfileMetrics = {
  discipline: number;
  consistency: number;
  execution: number;
  urgeControl: number;
  bossCommitment: number;
  currentStreak: number;
  bestStreak: number;
  daysHeld: number;
  victories: number;
  losses: number;
  focusMinutes: number;
  bossDefeats: number;
  activeBosses: number;
  totalMarks: number;
  rank: string;
  lastFourteenDays: Array<{ date: string; active: boolean }>;
};

type AppState = {
  totalXp: number;
  profile: PlayerProfile;
  days: Record<string, DayRecord>;
  checkpostTemplates: Checkpost[];
  bosses: BossBattle[];
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
const STORAGE_BACKUP_KEY = "inner-war-v3-backup";
const AMBIENT_STORAGE_KEY = "inner-war-ambient-v1";
const REWARD_SOUND_STORAGE_KEY = "inner-war-reward-sound-v1";
const FOCUS_TIMER_STORAGE_KEY = "inner-war-active-timer-v1";
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

function platesForXp() {
  return 1;
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
    profile: {
      displayName: "Harsh",
      handle: "harsh",
      motto: "Hold the line. Reclaim the day.",
      joinedAt: today,
    },
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
    checkpostTemplates: [],
    bosses: [],
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

function resetCheckpostForDay(checkpost: Checkpost, coordinateIndex = checkpost.coordinateIndex): Checkpost {
  return {
    ...checkpost,
    loggedMinutes: 0,
    status: "pending",
    coordinateIndex,
  };
}

function normalizeCheckpostTemplates(checkposts: Checkpost[]) {
  const seen = new Set<string>();
  return checkposts
    .filter((checkpost) => !checkpost.id.startsWith("seed-") && checkpost.front === "routine")
    .filter((checkpost) => {
      if (seen.has(checkpost.id)) return false;
      seen.add(checkpost.id);
      return true;
    })
    .map((checkpost, coordinateIndex) => resetCheckpostForDay(checkpost, coordinateIndex));
}

function mergeBossHistory(bosses: BossBattle[]) {
  const merged = new Map<string, BossBattle>();
  for (const boss of bosses.filter(Boolean)) {
    const existing = merged.get(boss.id);
    if (!existing) {
      merged.set(boss.id, boss);
      continue;
    }
    const existingCompletedAt = existing.completedAt ?? "";
    const bossCompletedAt = boss.completedAt ?? "";
    const resolvedStatus =
      bossCompletedAt > existingCompletedAt || (existing.status === "active" && boss.status !== "active")
        ? boss.status
        : existing.status;
    merged.set(boss.id, {
      ...existing,
      ...boss,
      loggedMinutes: Math.max(existing.loggedMinutes ?? 0, boss.loggedMinutes ?? 0),
      workedDates: { ...(existing.workedDates ?? {}), ...(boss.workedDates ?? {}) },
      status: resolvedStatus,
      completedAt: bossCompletedAt > existingCompletedAt ? boss.completedAt : existing.completedAt,
    });
  }
  return [...merged.values()];
}

function normalizeBosses(bosses: BossBattle[]) {
  const seen = new Set<string>();
  return bosses
    .filter((boss) => !boss.id.startsWith("seed-boss-"))
    .filter((boss) => {
      if (seen.has(boss.id)) return false;
      seen.add(boss.id);
      return true;
    })
    .map((boss, index) => ({
      ...boss,
      image: boss.image || (index % 2 === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp"),
      status: boss.status ?? "active",
      workedDates: boss.workedDates ?? {},
      coordinateIndex: Math.min(index, 1),
    }));
}

function dailyCheckpostsFromTemplates(templates: Checkpost[]) {
  return normalizeCheckpostTemplates(templates).map((checkpost, coordinateIndex) =>
    resetCheckpostForDay(checkpost, coordinateIndex),
  );
}

function activeBossesForDay(bosses: BossBattle[]) {
  return normalizeBosses(bosses)
    .filter((boss) => boss.status === "active")
    .slice(0, 2)
    .map((boss, index) => ({
      ...boss,
      coordinateIndex: index,
      image: boss.image || (index === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp"),
    }));
}

function reconcileDayRecord(state: AppState, record: DayRecord) {
  const templates = dailyCheckpostsFromTemplates(state.checkpostTemplates ?? []);
  const existingById = new Map(record.checkposts.map((checkpost) => [checkpost.id, checkpost]));
  const checkposts = [
    ...record.checkposts.filter((checkpost) => !checkpost.id.startsWith("seed-")),
    ...templates.filter((template) => !existingById.has(template.id)),
  ];

  const activeBosses = activeBossesForDay(state.bosses ?? []);
  const existingBosses = record.bosses.filter((boss) => !boss.id.startsWith("seed-boss-"));
  const existingBossById = new Map(existingBosses.map((boss) => [boss.id, boss]));
  const bosses = [
    ...existingBosses,
    ...activeBosses.filter((boss) => !existingBossById.has(boss.id)),
  ].map((boss) => {
    const canonical = activeBosses.find((item) => item.id === boss.id);
    return canonical && boss.status === "active"
      ? {
          ...canonical,
          loggedMinutes: Math.max(canonical.loggedMinutes, boss.loggedMinutes),
          workedDates: { ...canonical.workedDates, ...boss.workedDates },
        }
      : boss;
  });

  return {
    ...record,
    checkposts,
    bosses,
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
    checkposts: dailyCheckpostsFromTemplates(state.checkpostTemplates ?? []),
    bosses: activeBossesForDay(state.bosses ?? []),
    evaluated: false,
  };
}

function allEvents(days: Record<string, DayRecord>) {
  return Object.values(days)
    .flatMap((day) => day.events)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeProfile(profile: Partial<PlayerProfile> | undefined, days: Record<string, DayRecord>): PlayerProfile {
  const earliestDay = Object.keys(days).sort()[0] ?? TODAY();
  const displayName = profile?.displayName?.trim() || "Harsh";
  const rawHandle = profile?.handle?.trim().replace(/^@+/, "") || displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    displayName,
    handle: rawHandle || "warrior",
    motto: profile?.motto?.trim() || "Hold the line. Reclaim the day.",
    joinedAt: profile?.joinedAt || earliestDay,
  };
}

function dayDistance(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`).getTime();
  const toDate = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((toDate - fromDate) / 86_400_000));
}

function profileRank(score: number) {
  if (score >= 90) return "Ascendant";
  if (score >= 75) return "Ironbound";
  if (score >= 60) return "Vanguard";
  if (score >= 40) return "Steadfast";
  if (score > 0) return "Initiate";
  return "Awakening";
}

function calculateProfileMetrics(state: AppState, today = TODAY()): ProfileMetrics {
  const records = Object.values(state.days);
  const events = allEvents(state.days);
  const checkposts = records.flatMap((record) => record.checkposts);
  const resolvedCheckposts = checkposts.filter((item) => item.status !== "pending");
  const wonCheckposts = resolvedCheckposts.filter((item) => item.status === "won").length;
  const urgeEvents = events.filter((event) => event.source === "urge");
  const urgeWins = urgeEvents.filter((event) => event.amount > 0).length;
  const bossProgress = events.filter((event) => event.source === "boss-progress").length;
  const bossDefeats = state.bosses.filter((boss) => boss.status === "defeated").length;
  const bossGiveUps = state.bosses.filter((boss) => boss.status === "given-up").length;

  const execution = resolvedCheckposts.length > 0 ? (wonCheckposts / resolvedCheckposts.length) * 100 : 0;
  const urgeControl = urgeEvents.length > 0 ? (urgeWins / urgeEvents.length) * 100 : 0;
  const bossSuccessUnits = bossProgress + bossDefeats * 4;
  const bossTotalUnits = bossSuccessUnits + bossGiveUps * 4;
  const bossCommitment = bossTotalUnits > 0 ? (bossSuccessUnits / bossTotalUnits) * 100 : 0;
  const disciplinePillars = [
    { value: execution, weight: 0.5, available: resolvedCheckposts.length > 0 },
    { value: urgeControl, weight: 0.3, available: urgeEvents.length > 0 },
    { value: bossCommitment, weight: 0.2, available: bossTotalUnits > 0 },
  ].filter((pillar) => pillar.available);
  const disciplineWeight = disciplinePillars.reduce((sum, pillar) => sum + pillar.weight, 0);
  const discipline = disciplineWeight > 0
    ? Math.round(disciplinePillars.reduce((sum, pillar) => sum + pillar.value * pillar.weight, 0) / disciplineWeight)
    : 0;

  const activeDates = new Set(
    records
      .filter((record) =>
        Boolean(record.leaveRequest) ||
        record.events.some((event) => event.source !== "midnight-evaluation") ||
        record.checkposts.some((item) => item.loggedMinutes > 0),
      )
      .map((record) => record.date),
  );
  let streakAnchor = activeDates.has(today) ? today : addDays(today, -1);
  let currentStreak = 0;
  while (activeDates.has(streakAnchor)) {
    currentStreak += 1;
    streakAnchor = addDays(streakAnchor, -1);
  }

  const activeDatesSorted = [...activeDates].sort();
  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | undefined;
  for (const date of activeDatesSorted) {
    runningStreak = previousDate && addDays(previousDate, 1) === date ? runningStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  }

  const windowStart = addDays(today, -29);
  const eligibleStart = state.profile.joinedAt > windowStart ? state.profile.joinedAt : windowStart;
  const todayIsActive = activeDates.has(today);
  const elapsedEligibleDays = dayDistance(eligibleStart, today) + 1;
  const eligibleDays = Math.max(0, elapsedEligibleDays - (todayIsActive ? 0 : 1));
  const heldInWindow = [...activeDates].filter((date) => date >= eligibleStart && date <= today).length;
  const attendance = eligibleDays > 0 ? Math.min(1, heldInWindow / eligibleDays) : 0;
  const consistency = Math.round((attendance * 0.7 + Math.min(1, currentStreak / 7) * 0.3) * 100);

  const focusMinutes = checkposts.reduce((sum, item) => sum + item.loggedMinutes, 0) +
    state.bosses.reduce((sum, boss) => sum + boss.loggedMinutes, 0);
  const lastFourteenDays = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    return { date, active: activeDates.has(date) };
  });

  return {
    discipline,
    consistency,
    execution: Math.round(execution),
    urgeControl: Math.round(urgeControl),
    bossCommitment: Math.round(bossCommitment),
    currentStreak,
    bestStreak,
    daysHeld: activeDates.size,
    victories: events.filter((event) => event.amount > 0).length,
    losses: events.filter((event) => event.amount < 0).length,
    focusMinutes,
    bossDefeats,
    activeBosses: state.bosses.filter((boss) => boss.status === "active").length,
    totalMarks: events.length,
    rank: profileRank(discipline),
    lastFourteenDays,
  };
}

function migrateState(raw: Partial<AppState>): AppState {
  const fallback = defaultState();
  const days = raw.days ?? fallback.days;
  const sortedDayEntries = Object.entries(days).sort(([a], [b]) => b.localeCompare(a));
  const migratedCheckpostTemplates = normalizeCheckpostTemplates(
    [
      ...(Array.isArray(raw.checkpostTemplates) ? raw.checkpostTemplates : []),
      ...sortedDayEntries.flatMap(([, day]) => day.checkposts ?? []),
    ],
  );
  const migratedBosses = normalizeBosses(
    mergeBossHistory([
      ...(Array.isArray(raw.bosses) ? raw.bosses : []),
      ...sortedDayEntries.flatMap(([, day]) => day.bosses ?? []),
    ]),
  );
  const normalizedDays = Object.fromEntries(
    Object.entries(days).map(([date, day]) => [
      date,
      {
        ...day,
        events: day.events ?? [],
        checkposts: day.checkposts ?? [],
        bosses: normalizeBosses(day.bosses ?? []),
        evaluated: Boolean(day.evaluated),
      },
    ]),
  );
  const existingCycles = Object.fromEntries(
    Object.entries(raw.cubeCycles ?? {}).map(([id, cycle]) => {
      const eventIds = Array.isArray(cycle.eventIds) ? cycle.eventIds : [];
      return [id, { ...cycle, eventIds, plateCount: eventIds.length }];
    }),
  ) as Record<string, CubeCycle>;
  const activeExisting = raw.activeCubeCycleId ? existingCycles[raw.activeCubeCycleId] : undefined;
  if (activeExisting) {
    return {
      totalXp: raw.totalXp ?? 0,
      profile: normalizeProfile(raw.profile, normalizedDays),
      days: normalizedDays,
      checkpostTemplates: migratedCheckpostTemplates,
      bosses: migratedBosses,
      cubeCycles: existingCycles,
      activeCubeCycleId: raw.activeCubeCycleId as string,
      reports: raw.reports ?? {},
    };
  }

  if (Object.keys(existingCycles).length > 0) {
    const cycle = makeCubeCycle(TODAY());
    return {
      totalXp: raw.totalXp ?? 0,
      profile: normalizeProfile(raw.profile, normalizedDays),
      days: normalizedDays,
      checkpostTemplates: migratedCheckpostTemplates,
      bosses: migratedBosses,
      cubeCycles: { ...existingCycles, [cycle.id]: cycle },
      activeCubeCycleId: cycle.id,
      reports: raw.reports ?? {},
    };
  }

  const sortedEvents = allEvents(normalizedDays);
  const startDate = sortedEvents[0]?.date ?? TODAY();
  const cycle = makeCubeCycle(startDate);
  const plateCount = sortedEvents.length;
  const migratedCycle: CubeCycle = {
    ...cycle,
    eventIds: sortedEvents.map((event) => event.id),
    plateCount,
  };
  return {
    totalXp: raw.totalXp ?? 0,
    profile: normalizeProfile(raw.profile, normalizedDays),
    days: normalizedDays,
    checkpostTemplates: migratedCheckpostTemplates,
    bosses: migratedBosses,
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
  if (!active || active.status === "completed") {
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
  if (active.plateCount >= CUBE_CAPACITY) {
    return completeActiveCubeCycle(state, "cube-full", today);
  }
  if (active.status === "active" && today >= active.endsAt) {
    return completeActiveCubeCycle(state, "ten-day-cycle", today);
  }
  return state;
}

function attachEventToCubeCycle(state: AppState, event: XpEvent) {
  let next = rotateCubeByDate(state, event.date);
  const active = next.cubeCycles[next.activeCubeCycleId];
  const plateCount = active.plateCount + platesForXp();
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
    });
  if (bosses.length !== record.bosses.length) changed = true;
  if (!changed) return record;
  return {
    ...record,
    bosses,
  };
}

function sameDayRecord(a: DayRecord, b: DayRecord) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function priorityLabel(priority: Priority) {
  return priority === "routine" ? "Routine" : priority[0].toUpperCase() + priority.slice(1);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function CommandNavIcon({ view }: { view: AppView }) {
  if (view === "cube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v8.5" />
      </svg>
    );
  }
  if (view === "war") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19 19 4m-5 0h5v5M20 19 5 4m0 0v5m0-5h5" />
        <path d="m3 17 4 4m10-4 4 4" />
      </svg>
    );
  }
  if (view === "reports") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M15 3v5h4M9 12h7M9 16h7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v6c0 5-3.2 7.6-8 9-4.8-1.4-8-4-8-9V6l8-3Z" />
      <circle cx="12" cy="10" r="2.3" />
      <path d="M8.5 16c.9-2 2-3 3.5-3s2.6 1 3.5 3" />
    </svg>
  );
}

function CommandNav({ active, onNavigate }: { active: AppView; onNavigate: (view: AppView) => void }) {
  const items: Array<{ view: AppView; label: string; index: string }> = [
    { view: "cube", label: "Cube", index: "I" },
    { view: "war", label: "War Map", index: "II" },
    { view: "reports", label: "Reports", index: "III" },
    { view: "profile", label: "Profile", index: "IV" },
  ];
  return (
    <nav className="command-nav" aria-label="Primary navigation">
      <span className="command-nav-mark" aria-hidden="true">IW</span>
      {items.filter((item) => item.view !== active).map((item) => (
        <button
          key={item.view}
          className="command-nav-button"
          type="button"
          aria-label={item.label}
          data-label={item.label}
          onClick={() => onNavigate(item.view)}
        >
          <CommandNavIcon view={item.view} />
          <small aria-hidden="true">{item.index}</small>
        </button>
      ))}
    </nav>
  );
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
  const recoveredFromBackupRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<AppView>("cube");
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
  const day = reconcileDayRecord(state, todayRecord(state, date));
  const level = useMemo(() => levelFromXp(state.totalXp), [state.totalXp]);
  const profileMetrics = useMemo(() => calculateProfileMetrics(state, date), [date, state]);
  const fronts: FrontId[] = ["routine", "priorities", "boss"];
  const activeFront = fronts[frontIndex];
  const cubeEvents = useMemo(() => eventsForCycle(state, state.activeCubeCycleId), [state]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const candidates = [
        window.localStorage.getItem(STORAGE_KEY),
        window.localStorage.getItem(STORAGE_BACKUP_KEY),
      ];
      let restored: AppState | null = null;
      for (const [index, stored] of candidates.entries()) {
        if (!stored) continue;
        try {
          const parsed = JSON.parse(stored) as AppState;
          restored = migrateState(parsed);
          recoveredFromBackupRef.current = index === 1;
          break;
        } catch {
          // Try the backup before falling back to a new state.
        }
      }
      setState(evaluatePastDays(approveDueLeave(ensureToday(restored ?? defaultState()))));
      setRewardMuted(readRewardSoundMuted());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
    // Hydration must read storage exactly once before persistence is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) {
      const serialized = JSON.stringify(state);
      const previous = window.localStorage.getItem(STORAGE_KEY);
      if (previous && previous !== serialized && !recoveredFromBackupRef.current) {
        window.localStorage.setItem(STORAGE_BACKUP_KEY, previous);
      }
      window.localStorage.setItem(STORAGE_KEY, serialized);
      recoveredFromBackupRef.current = false;
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(REWARD_SOUND_STORAGE_KEY, rewardMuted ? "muted" : "enabled");
    if (rewardMuted && rewardAudioRef.current) {
      rewardAudioRef.current.pause();
      rewardAudioRef.current.currentTime = 0;
      setRewardPlaying(false);
    }
  }, [hydrated, rewardMuted]);

  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(null), 900);
    return () => window.clearTimeout(id);
  }, [pulse]);

  useEffect(() => {
    const maintainCurrentDay = () => {
      setState((current) => approveDueLeave(evaluatePastDays(ensureToday(current))));
    };
    const id = window.setInterval(maintainCurrentDay, 30_000);
    window.addEventListener("focus", maintainCurrentDay);
    document.addEventListener("visibilitychange", maintainCurrentDay);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", maintainCurrentDay);
      document.removeEventListener("visibilitychange", maintainCurrentDay);
    };
    // The interval always uses the latest state via the setState callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureToday(current: AppState) {
    current = rotateCubeByDate(current);
    const today = TODAY();
    if (current.days[today]) {
      const enriched = reconcileDayRecord(current, enrichDemoContent(current.days[today]));
      return sameDayRecord(enriched, current.days[today])
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
          checkposts: dailyCheckpostsFromTemplates(current.checkpostTemplates ?? []),
          bosses: activeBossesForDay(current.bosses ?? []),
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

  function logUrge(outcome: UrgeOutcome, strength: UrgeStrength) {
    const amount = URGE_XP[outcome][strength];
    setState((current) =>
      applyXp(ensureToday(current), TODAY(), amount, `${outcome === "beat" ? "Beat" : "Lost to"} ${strength} urge`, "urge", true, {
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
      const actionDate = TODAY();
      let next = applyXp(
        ensureToday(current),
        actionDate,
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
      const record = todayRecord(next, actionDate);
      next = {
        ...next,
        days: {
          ...next.days,
          [actionDate]: {
            ...record,
            checkposts: record.checkposts.map((item) => (item.id === id ? { ...item, status } : item)),
          },
        },
      };
      return withReportForDate(next, actionDate);
    });
  }

  function giveUpCheckpost(id: string) {
    setState((current) => {
      const actionDate = TODAY();
      const base = ensureToday(current);
      const record = todayRecord(base, actionDate);
      return withReportForDate({
        ...base,
        days: {
          ...base.days,
          [actionDate]: {
            ...record,
            checkposts: record.checkposts.map((item) => (item.id === id ? { ...item, status: "given-up" } : item)),
          },
        },
      }, actionDate);
    });
    setSelectedCheckpostId(null);
  }

  function addCheckpost(front: FrontId, draft: AddDraft) {
    setState((current) => {
      const today = TODAY();
      const base = ensureToday(current);
      const record = todayRecord(base, today);
      if (front === "boss") {
        const activeBosses = activeBossesForDay(base.bosses ?? []);
        if (activeBosses.length >= 2) return base;
        const slot = activeBosses.length;
        const boss = makeBoss(draft.name, draft.allottedMinutes, draft.description, slot, crypto.randomUUID(), slot === 0 ? "/assets/boss1.webp" : "/assets/boss2.webp");
        return {
          ...base,
          bosses: [...(base.bosses ?? []), boss],
          days: {
            ...base.days,
            [today]: {
              ...record,
              bosses: [...record.bosses, boss],
            },
          },
        };
      }

      const templates = normalizeCheckpostTemplates(base.checkpostTemplates ?? []);
      const frontItems = front === "routine"
        ? templates
        : record.checkposts.filter((item) => item.front === "priorities");
      if (front === "routine" && frontItems.length >= 10) return base;
      if (front === "priorities") {
        if (frontItems.length >= 8) return base;
        const counts = {
          high: frontItems.filter((item) => item.priority === "high").length,
          medium: frontItems.filter((item) => item.priority === "medium").length,
          low: frontItems.filter((item) => item.priority === "low").length,
        };
        if (draft.priority === "high" && counts.high >= 2) return base;
        if (draft.priority === "medium" && counts.medium >= 4) return base;
        if (draft.priority === "low" && counts.low >= 2) return base;
      }

      const checkpost = makeCheckpost(
        draft.name,
        front,
        front === "routine" ? "routine" : draft.priority,
        draft.allottedMinutes,
        draft.description,
        frontItems.length,
      );
      return {
        ...base,
        checkpostTemplates: front === "routine"
          ? normalizeCheckpostTemplates([...(base.checkpostTemplates ?? []), checkpost])
          : templates,
        days: {
          ...base.days,
          [today]: {
            ...record,
            checkposts: [...record.checkposts, resetCheckpostForDay(checkpost, frontItems.length)],
          },
        },
      };
    });
    setAddingFront(null);
  }

  function logTimer(kind: "checkpost" | "boss", id: string, minutes: number) {
    setState((current) => {
      const actionDate = TODAY();
      const base = ensureToday(current);
      const record = todayRecord(base, actionDate);
      let nextRecord: DayRecord;
      let nextBosses = base.bosses ?? [];
      if (kind === "boss") {
        nextBosses = nextBosses.map((boss) => (boss.id === id ? { ...boss, loggedMinutes: boss.loggedMinutes + minutes } : boss));
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
        bosses: nextBosses,
        days: {
          ...base.days,
          [actionDate]: nextRecord,
        },
      }, actionDate);
    });
  }
  function bossWorked(id: string, amount: 2 | 3) {
    setState((current) => {
      const actionDate = TODAY();
      const base = ensureToday(current);
      const boss = activeBossesForDay(base.bosses).find((item) => item.id === id);
      if (!boss || boss.workedDates[actionDate]) return base;
      let next = applyXp(base, actionDate, amount, `Worked on ${boss.name}`, "boss-progress", true, {
        minutes: boss.loggedMinutes,
        outcome: "progress",
        entityId: boss.id,
        entityName: boss.name,
      });
      const record = todayRecord(next, actionDate);
      next = {
        ...next,
        bosses: next.bosses.map((item) => (item.id === id ? { ...item, workedDates: { ...item.workedDates, [actionDate]: true } } : item)),
        days: {
          ...next.days,
          [actionDate]: {
            ...record,
            bosses: record.bosses.map((item) => (item.id === id ? { ...item, workedDates: { ...item.workedDates, [actionDate]: true } } : item)),
          },
        },
      };
      return withReportForDate(next, actionDate);
    });
  }

  function resolveBoss(id: string, defeated: boolean) {
    setState((current) => {
      const actionDate = TODAY();
      const base = ensureToday(current);
      const boss = activeBossesForDay(base.bosses).find((item) => item.id === id);
      if (!boss) return base;
      let next = applyXp(
        base,
        actionDate,
        defeated ? 40 : -40,
        `${defeated ? "Defeated" : "Gave up"} ${boss.name}`,
        "boss-resolution",
        true,
        { outcome: defeated ? "win" : "give-up", entityId: boss.id, entityName: boss.name },
      );
      const record = todayRecord(next, actionDate);
      next = {
        ...next,
        bosses: next.bosses.map((item) =>
          item.id === id ? { ...item, status: defeated ? "defeated" : "given-up", completedAt: actionDate } : item,
        ),
        days: {
          ...next.days,
          [actionDate]: {
            ...record,
            bosses: record.bosses.map((item) =>
              item.id === id ? { ...item, status: defeated ? "defeated" : "given-up", completedAt: actionDate } : item,
            ),
          },
        },
      };
      return withReportForDate(next, actionDate);
    });
    setSelectedBossId(null);
  }

  function fileLeave(reason: string, note: string) {
    setState((current) => {
      const actionDate = TODAY();
      const base = ensureToday(current);
      const record = todayRecord(base, actionDate);
      return withReportForDate({
        ...base,
        days: {
          ...base.days,
          [actionDate]: {
            ...record,
            leaveRequest: {
              id: crypto.randomUUID(),
              date: actionDate,
              reason,
              note,
              requestedAt: Date.now(),
              approvedAt: Date.now() + 10 * 60 * 1000,
            },
          },
        },
      }, actionDate);
    });
    setLeaveOpen(false);
  }

  function updateProfile(profile: PlayerProfile) {
    setState((current) => ({
      ...current,
      profile: normalizeProfile(profile, current.days),
    }));
  }

  const selectedCheckpost = day.checkposts.find((item) => item.id === selectedCheckpostId);
  const selectedBoss = day.bosses.find((item) => item.id === selectedBossId && item.status === "active");

  return (
    <main className={cx("min-h-screen overflow-hidden bg-[#05070b] text-[#f8e9bd]", view === "profile" && "profile-view-active")}>
      <div className="fixed inset-0 terrain-bg opacity-90" />
      <div className="fixed inset-0 smoke-screen" />
      <GlobalXpBar totalXp={state.totalXp} dayXp={day.xpDelta} level={level} pulse={pulse} />
      <AmbientMusicPlayer compact={view === "profile"} />
      <RewardSoundControl
        muted={rewardMuted}
        playing={rewardPlaying}
        compact={view === "profile"}
        onToggleMute={() => setRewardMuted((value) => !value)}
        onStop={stopRewardSound}
      />

      <div className="relative z-10 min-h-screen">
        <CommandNav active={view} onNavigate={setView} />
        {view === "cube" ? (
          <section className="landing-stage">
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
        ) : view === "reports" ? (
          <ReportsScreen
            today={date}
            days={state.days}
            reports={state.reports}
          />
        ) : (
          <ProfileScreen
            profile={state.profile}
            metrics={profileMetrics}
            level={level}
            totalXp={state.totalXp}
            activeCycle={state.cubeCycles[state.activeCubeCycleId]}
            onUpdateProfile={updateProfile}
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

function AmbientMusicPlayer({ compact = false }: { compact?: boolean }) {
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
    <aside className={cx("ambient-player", compact && "ambient-compact", status === "playing" && "ambient-playing", status === "paused" && "ambient-paused")}>
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
  compact = false,
  onToggleMute,
  onStop,
}: {
  muted: boolean;
  playing: boolean;
  compact?: boolean;
  onToggleMute: () => void;
  onStop: () => void;
}) {
  return (
    <aside className={cx("reward-sound-control", compact && "reward-sound-compact", playing && "reward-sound-playing", muted && "reward-sound-muted")}>
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

function ScoreRing({ value, label, tone }: { value: number; label: string; tone: "brass" | "oxblood" }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.min(100, Math.max(0, value)) / 100;
  return (
    <div className={cx("profile-score", `profile-score-${tone}`)}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="score-track" cx="52" cy="52" r={radius} />
        <circle className="score-value" cx="52" cy="52" r={radius} strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProfileFrameSvg() {
  return (
    <svg className="profile-frame-svg" viewBox="0 0 1000 570" preserveAspectRatio="none" aria-hidden="true">
      <rect x="16" y="16" width="968" height="538" rx="4" />
      <rect x="25" y="25" width="950" height="520" rx="2" />
      <path d="M16 92 H42 V42 H92 M908 42 H958 V92 M958 478 V528 H908 M92 528 H42 V478" />
      <path className="frame-rune" d="M16 118 C46 118 46 88 76 88 C106 88 106 118 136 118 M864 118 C894 118 894 88 924 88 C954 88 954 118 984 118" />
      <path className="frame-rune" d="M16 452 C46 452 46 482 76 482 C106 482 106 452 136 452 M864 452 C894 452 894 482 924 482 C954 482 954 452 984 452" />
      <path d="M452 25 H548 M452 545 H548" />
      <path className="frame-rune" d="M500 17 508 25 500 33 492 25Z M500 537 508 545 500 553 492 545Z" />
    </svg>
  );
}

function ProfileEmblem({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "W";
  return (
    <div className="profile-emblem" aria-label={`${name} emblem`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M60 8 C76 20 91 23 103 24 V58 C103 83 86 101 60 112 C34 101 17 83 17 58 V24 C29 23 44 20 60 8Z" />
        <path d="M60 19 C73 28 84 31 93 32 V58 C93 76 81 90 60 100 C39 90 27 76 27 58 V32 C36 31 47 28 60 19Z" />
        <path d="M39 41 H81 M35 78 H85" />
      </svg>
      <strong>{initial}</strong>
    </div>
  );
}

function ProfileScreen({
  profile,
  metrics,
  level,
  totalXp,
  activeCycle,
  onUpdateProfile,
}: {
  profile: PlayerProfile;
  metrics: ProfileMetrics;
  level: ReturnType<typeof levelFromXp>;
  totalXp: number;
  activeCycle?: CubeCycle;
  onUpdateProfile: (profile: PlayerProfile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [shareStatus, setShareStatus] = useState("");
  const plateCount = activeCycle?.plateCount ?? 0;

  async function snapshotBlob() {
    setShareStatus("Forging snapshot...");
    const blob = await createProfileSnapshot(profile, metrics, level, totalXp, plateCount);
    if (!blob) throw new Error("Snapshot could not be rendered.");
    return blob;
  }

  async function shareSnapshot() {
    try {
      const blob = await snapshotBlob();
      const file = new File([blob], `${profile.handle || "inner-war"}-profile.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `${profile.displayName} - The Inner War`, text: profile.motto, files: [file] });
        setShareStatus("Snapshot shared.");
        return;
      }
      downloadBlob(blob, file.name);
      setShareStatus("PNG downloaded.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareStatus("");
        return;
      }
      setShareStatus("Share unavailable. Use Download PNG.");
    }
  }

  async function copySnapshot() {
    try {
      const blob = await snapshotBlob();
      if (!("ClipboardItem" in window) || !navigator.clipboard?.write) throw new Error("Clipboard image unavailable");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setShareStatus("Image copied.");
    } catch {
      setShareStatus("Image copy is unavailable in this browser.");
    }
  }

  async function downloadSnapshot() {
    try {
      const blob = await snapshotBlob();
      downloadBlob(blob, `${profile.handle || "inner-war"}-profile.png`);
      setShareStatus("PNG downloaded.");
    } catch {
      setShareStatus("Snapshot could not be rendered.");
    }
  }

  function saveIdentity(event: FormEvent) {
    event.preventDefault();
    onUpdateProfile(draft);
    setShareStatus("Identity updated.");
  }

  return (
    <section className="dossier-screen">
      <div className="dossier-layout">
        <article className="dossier-card" aria-label={`${profile.displayName} public discipline profile`}>
          <ProfileFrameSvg />
          <header className="dossier-masthead">
            <div>
              <span className="profile-signal" />
              <strong>The Inner War</strong>
              <em>Personal Field Record</em>
            </div>
            <span className="profile-card-date">Campaign {plateCount}/{CUBE_CAPACITY}</span>
          </header>

          <div className="dossier-identity">
            <ProfileEmblem name={profile.displayName} />
            <div>
              <p>@{profile.handle}</p>
              <h1>{profile.displayName}</h1>
              <span>{metrics.rank} / Level {level.level}</span>
            </div>
          </div>

          <blockquote>{profile.motto}</blockquote>

          <div className="dossier-scores">
            <ScoreRing value={metrics.discipline} label="Discipline" tone="brass" />
            <ScoreRing value={metrics.consistency} label="Consistency" tone="oxblood" />
          </div>

          <div className="dossier-statline">
            <div><span>Lifetime XP</span><strong>{totalXp}</strong></div>
            <div><span>Current Streak</span><strong>{metrics.currentStreak}<small>d</small></strong></div>
            <div><span>Victories</span><strong>{metrics.victories}</strong></div>
            <div><span>Focus</span><strong>{metrics.focusMinutes}<small>m</small></strong></div>
          </div>

          <footer className="dossier-fortnight">
            <div className="dossier-days" aria-label="Last fourteen days activity">
              {metrics.lastFourteenDays.map((item) => (
                <span key={item.date} className={item.active ? "active" : ""} title={item.date} />
              ))}
            </div>
            <div><span>Fortnight Record</span><strong>{metrics.daysHeld} days held / {metrics.bestStreak}d best</strong></div>
            <b>Founded {profile.joinedAt}</b>
          </footer>
        </article>

        <aside className="dossier-console">
          <header className="dossier-console-header">
            <span>Personal command</span>
            <h2>Edit the record</h2>
            <p>Refine your public identity and carry the field card with you.</p>
          </header>
          <div className="dossier-actions">
            <button className="dossier-primary-action" onClick={shareSnapshot}>Share Card</button>
            <button className="dossier-secondary-action" onClick={copySnapshot}>Copy Card</button>
            <button className="dossier-secondary-action" onClick={downloadSnapshot}>Save PNG</button>
          </div>
          <p className="dossier-status" role="status">{shareStatus || "Field record ready"}</p>

          <form className="dossier-identity-form" onSubmit={saveIdentity}>
            <p className="panel-kicker">Inscription</p>
            <label className="field-label">
              Display name
              <input maxLength={28} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
            </label>
            <label className="field-label">
              Handle
              <input maxLength={24} value={draft.handle} onChange={(event) => setDraft({ ...draft, handle: event.target.value.replace(/^@+/, "") })} />
            </label>
            <label className="field-label">
              Creed
              <input maxLength={64} value={draft.motto} onChange={(event) => setDraft({ ...draft, motto: event.target.value })} />
            </label>
            <button className="panel-action" type="submit">Save Identity</button>
          </form>

          <div className="dossier-formula">
            <p className="panel-kicker">Measure of Resolve</p>
            <div><span>Execution · 50%</span><strong>{metrics.execution}</strong></div>
            <div><span>Urge control · 30%</span><strong>{metrics.urgeControl}</strong></div>
            <div><span>Boss commitment · 20%</span><strong>{metrics.bossCommitment}</strong></div>
            <p>Discipline uses recorded pillars only. Consistency is 70% attendance across eligible days and 30% momentum toward a seven-day streak.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function canvasRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize: number, weight = 800) {
  let size = maxSize;
  while (size > minSize) {
    context.font = `${weight} ${size}px Georgia, serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function drawCanvasScore(context: CanvasRenderingContext2D, x: number, y: number, value: number, label: string, color: string) {
  context.save();
  context.lineWidth = 11;
  context.strokeStyle = "rgba(196, 174, 125, 0.16)";
  context.beginPath();
  context.arc(x, y, 62, 0, Math.PI * 2);
  context.stroke();
  context.shadowColor = color;
  context.shadowBlur = 18;
  context.strokeStyle = color;
  context.beginPath();
  context.arc(x, y, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(100, value) / 100);
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#efe2bd";
  context.font = "700 45px Georgia, serif";
  context.textAlign = "center";
  context.fillText(String(value), x, y + 14);
  context.fillStyle = "#9f8c68";
  context.font = "700 15px Georgia, serif";
  context.fillText(label.toUpperCase(), x, y + 92);
  context.restore();
}

async function createProfileSnapshot(profile: PlayerProfile, metrics: ProfileMetrics, level: ReturnType<typeof levelFromXp>, totalXp: number, plateCount: number) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#090806";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const glow = context.createRadialGradient(600, 330, 30, 600, 330, 680);
  glow.addColorStop(0, "rgba(112, 78, 37, 0.16)");
  glow.addColorStop(0.62, "rgba(50, 22, 17, 0.08)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  canvasRoundedRect(context, 28, 28, 1144, 619, 20);
  context.fillStyle = "#11120f";
  context.fill();
  try {
    const mapTexture = new Image();
    mapTexture.src = "/assets/DailyRoutine.webp";
    await mapTexture.decode();
    context.save();
    canvasRoundedRect(context, 28, 28, 1144, 619, 20);
    context.clip();
    context.globalAlpha = 0.075;
    context.filter = "grayscale(1) sepia(0.35) contrast(1.18)";
    context.drawImage(mapTexture, 28, 28, 1144, 619);
    context.restore();
  } catch {
    // The record remains exportable when the decorative map texture is unavailable.
  }
  context.strokeStyle = "rgba(175, 137, 75, 0.75)";
  context.lineWidth = 2;
  context.stroke();
  canvasRoundedRect(context, 40, 40, 1120, 595, 14);
  context.strokeStyle = "rgba(122, 89, 48, 0.55)";
  context.lineWidth = 1;
  context.stroke();
  context.strokeStyle = "rgba(142, 105, 57, 0.6)";
  context.beginPath();
  context.moveTo(58, 92);
  context.lineTo(1142, 92);
  context.stroke();

  context.fillStyle = "#d5bc86";
  context.font = "700 18px Georgia, serif";
  context.textAlign = "left";
  context.fillText("THE INNER WAR", 64, 70);
  context.fillStyle = "#8d7d62";
  context.font = "700 13px Georgia, serif";
  context.fillText("PERSONAL FIELD RECORD", 245, 70);
  context.textAlign = "right";
  context.fillStyle = "#aa8041";
  context.fillText(`CAMPAIGN ${plateCount}/${CUBE_CAPACITY}`, 1136, 70);

  context.save();
  context.translate(138, 190);
  context.strokeStyle = "rgba(185, 145, 76, 0.8)";
  context.lineWidth = 3;
  context.shadowColor = "#6f441e";
  context.shadowBlur = 10;
  context.beginPath();
  context.moveTo(0, -74);
  context.bezierCurveTo(28, -54, 51, -50, 67, -49);
  context.lineTo(67, 3);
  context.bezierCurveTo(67, 43, 42, 68, 0, 86);
  context.bezierCurveTo(-42, 68, -67, 43, -67, 3);
  context.lineTo(-67, -49);
  context.bezierCurveTo(-51, -50, -28, -54, 0, -74);
  context.closePath();
  context.fillStyle = "rgba(39, 27, 17, 0.92)";
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-42, -20);
  context.lineTo(42, -20);
  context.moveTo(-38, 46);
  context.lineTo(38, 46);
  context.strokeStyle = "rgba(130, 92, 47, 0.6)";
  context.lineWidth = 1;
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#ead9ae";
  context.font = "700 66px Georgia, serif";
  context.textAlign = "center";
  context.fillText(profile.displayName.charAt(0).toUpperCase() || "W", 0, 24);
  context.restore();

  context.textAlign = "left";
  context.fillStyle = "#9b7846";
  context.font = "700 18px Georgia, serif";
  context.fillText(`@${profile.handle}`, 236, 139);
  const nameSize = fitCanvasText(context, profile.displayName, 480, 60, 32, 900);
  context.fillStyle = "#efe3c3";
  context.font = `700 ${nameSize}px Georgia, serif`;
  context.fillText(profile.displayName, 232, 200);
  context.fillStyle = "#b8904f";
  context.font = "700 18px Georgia, serif";
  context.fillText(`${metrics.rank.toUpperCase()}  /  LEVEL ${level.level}`, 236, 236);
  const mottoSize = fitCanvasText(context, profile.motto, 500, 21, 14, 500);
  context.fillStyle = "#aaa083";
  context.font = `500 ${mottoSize}px Georgia, serif`;
  context.fillText(`“${profile.motto}”`, 236, 282);

  drawCanvasScore(context, 845, 194, metrics.discipline, "Discipline", "#b78a45");
  drawCanvasScore(context, 1045, 194, metrics.consistency, "Consistency", "#7c2f28");

  const stats = [
    ["LIFETIME XP", String(totalXp)],
    ["CURRENT STREAK", `${metrics.currentStreak}D`],
    ["VICTORIES", String(metrics.victories)],
    ["FOCUS", `${metrics.focusMinutes}M`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 70 + index * 280;
    canvasRoundedRect(context, x, 360, 248, 128, 10);
    context.fillStyle = "rgba(20, 16, 11, 0.9)";
    context.fill();
    context.strokeStyle = index % 2 === 0 ? "rgba(164, 128, 68, 0.36)" : "rgba(112, 45, 37, 0.45)";
    context.stroke();
    context.fillStyle = "#8d8065";
    context.font = "700 14px Georgia, serif";
    context.textAlign = "left";
    context.fillText(label, x + 22, 395);
    context.fillStyle = "#eadfbe";
    context.font = "700 45px Georgia, serif";
    context.fillText(value, x + 22, 455);
  });

  context.fillStyle = "#887b61";
  context.font = "700 13px Georgia, serif";
  context.fillText("FORTNIGHT RECORD", 70, 548);
  metrics.lastFourteenDays.forEach((item, index) => {
    canvasRoundedRect(context, 70 + index * 34, 568, 22, 22, 4);
    context.fillStyle = item.active ? "#ad8244" : "rgba(126, 111, 79, 0.17)";
    context.shadowColor = item.active ? "#8d5f2d" : "transparent";
    context.shadowBlur = item.active ? 7 : 0;
    context.fill();
  });
  context.shadowBlur = 0;
  context.textAlign = "right";
  context.fillStyle = "#aaa083";
  context.font = "700 15px Georgia, serif";
  context.fillText(`${metrics.daysHeld} DAYS HELD  /  ${metrics.bestStreak}D BEST STREAK`, 1134, 584);
  context.fillStyle = "#796b52";
  context.font = "700 12px Georgia, serif";
  context.fillText(`FOUNDED ${profile.joinedAt}  /  ${TODAY()}`, 1134, 615);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportsScreen({
  today,
  days,
  reports,
}: {
  today: string;
  days: Record<string, DayRecord>;
  reports: Record<string, DayReport>;
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
  const limitText = front === "routine" ? `${day.checkposts.filter((item) => item.front === "routine").length}/10 recurring` : front === "priorities" ? priorityUsage(day) : `${day.bosses.filter((boss) => boss.status === "active").length}/2 bosses`;

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
  const [timerHydrated, setTimerHydrated] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedSecondsRef = useRef(0);
  const timerKey = `${target.kind}:${target.id}`;

  function currentElapsedSeconds() {
    if (!running) return accumulatedSecondsRef.current;
    if (startedAtRef.current === null) return accumulatedSecondsRef.current;
    return accumulatedSecondsRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000);
  }

  function syncElapsed() {
    setElapsed(currentElapsedSeconds());
  }

  function toggleRunning() {
    if (running) {
      accumulatedSecondsRef.current = currentElapsedSeconds();
      startedAtRef.current = null;
      setRunning(false);
      setElapsed(accumulatedSecondsRef.current);
      return;
    }
    startedAtRef.current = Date.now();
    setRunning(true);
  }

  function addSeconds(seconds: number) {
    accumulatedSecondsRef.current = currentElapsedSeconds() + seconds;
    startedAtRef.current = Date.now();
    setElapsed(accumulatedSecondsRef.current);
  }

  function clearStoredTimer() {
    window.localStorage.removeItem(FOCUS_TIMER_STORAGE_KEY);
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);
      if (!stored) {
        startedAtRef.current = Date.now();
        setTimerHydrated(true);
        return;
      }
      try {
        const parsed = JSON.parse(stored) as { key?: string; accumulatedSeconds?: number; startedAt?: number | null; running?: boolean };
        if (parsed.key !== timerKey) {
          startedAtRef.current = Date.now();
          setTimerHydrated(true);
          return;
        }
        accumulatedSecondsRef.current = Math.max(0, parsed.accumulatedSeconds ?? 0);
        startedAtRef.current = parsed.running ? parsed.startedAt ?? Date.now() : null;
        setRunning(Boolean(parsed.running));
        setElapsed(currentElapsedSeconds());
      } catch {
        clearStoredTimer();
        startedAtRef.current = Date.now();
      }
      setTimerHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey]);

  useEffect(() => {
    if (!timerHydrated) return;
    window.localStorage.setItem(
      FOCUS_TIMER_STORAGE_KEY,
      JSON.stringify({
        key: timerKey,
        accumulatedSeconds: accumulatedSecondsRef.current,
        startedAt: startedAtRef.current,
        running,
      }),
    );
  }, [elapsed, running, timerHydrated, timerKey]);

  useEffect(() => {
    if (!running) return;
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    const id = window.setInterval(() => {
      syncElapsed();
    }, 1000);
    return () => window.clearInterval(id);
    // The interval only refreshes the display; elapsed time is derived from Date.now().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    const refreshOnFocus = () => syncElapsed();
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="timer-overlay">
      <div className="timer-scene">
        <p className="panel-kicker">Quiet Front</p>
        <h2>{target.name}</h2>
        <div className="timer-readout">{elapsedMinutes}<span>:{elapsedSeconds}</span></div>
        <p className="timer-unit">minutes elapsed</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="panel-action" onClick={toggleRunning}>{running ? "Pause" : "Resume"}</button>
          <button className="panel-action" onClick={() => addSeconds(300)}>Add 5 min</button>
          <button className="panel-action" onClick={() => addSeconds(600)}>Add 10 min</button>
          <button
            className="victory-button small"
            onClick={() => {
              const minutes = Math.ceil(currentElapsedSeconds() / 60);
              clearStoredTimer();
              onClose(minutes);
            }}
          >
            Finish
          </button>
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
  if (front === "routine") return "Recurring Routine";
  if (front === "priorities") return "Daily Tasks";
  return "Boss Battle";
}

function frontSubline(front: FrontId) {
  if (front === "routine") return "Recurring fields return each day until retired.";
  if (front === "priorities") return "Today only: 2 high, 4 medium, 2 low.";
  return "Long wars. No daily penalty. Surrender costs dearly.";
}

function priorityUsage(day: DayRecord) {
  const items = day.checkposts.filter((item) => item.front === "priorities");
  const count = (priority: Priority) => items.filter((item) => item.priority === priority).length;
  return `${items.length}/8 total · H ${count("high")}/2 · M ${count("medium")}/4 · L ${count("low")}/2`;
}
