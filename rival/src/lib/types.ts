export type Category = "steps" | "cardio" | "strength" | "mobility";

export type Scoring = {
  steps: { per: number; points: number; daily_cap: number };
  cardio: { per: number; points: number; daily_cap: number };
  strength: { per: number; points: number; daily_cap: number };
  mobility: { per: number; points: number; daily_cap: number };
  planned_workout: number;
  daily_goal: number;
  active_day: { minutes: number; steps: number };
  consistency: { days: number; points: number };
  daily_cap: number;
};

export type DayScore = {
  user_id: string;
  day: string;
  steps_pts: number;
  cardio_pts: number;
  strength_pts: number;
  mobility_pts: number;
  plan_pts: number;
  goal_pts: number;
  raw_total: number;
  total: number;
  is_active: boolean;
  goal_met: boolean;
  plan_done: boolean;
  workouts: number;
  // Raw metrics: present for yourself, null for others unless they share.
  steps: number | null;
  active_minutes: number | null;
  cardio_min: number | null;
  strength_min: number | null;
  mobility_min: number | null;
};

export type Member = {
  id: string;
  displayName: string;
  teamName: string;
  teamAbbr: string;
  teamColor: string;
  avatarUrl: string | null;
  pledged: boolean;
  role: "commissioner" | "member";
  active: boolean;
  joinedAt: string;
};

export type LeagueStatus = "preseason" | "regular" | "playoffs" | "complete";
export type WeekStatus = "upcoming" | "live" | "pending" | "final";

export type Matchup = {
  id: string;
  week: number;
  weekStart: string;
  kind: "regular" | "playoff" | "championship";
  round: number | null;
  homeId: string;
  awayId: string | null;
  homeSeed: number | null;
  awaySeed: number | null;
  homeScore: number;
  awayScore: number | null;
  winnerId: string | null;
  isTie: boolean;
  final: boolean;
};

export type WeekTotal = { points: number; activeDays: number; bonus: number };

export type Projection = {
  projected: number;
  dailyRate: number;
  enoughData: boolean;
};

export type MatchupView = Matchup & {
  status: WeekStatus;
  winProbHome: number | null;
  /** True while either side has < 3 days of data (prior-weighted estimate). */
  projectionEarly: boolean;
  projectedHome: number | null;
  projectedAway: number | null;
};

export type Standing = {
  userId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  games: number;
  rank: number;
};

export type FeedItem = {
  id: string;
  userId: string;
  label: string;
  category: Category;
  activityDate: string;
  durationMin: number | null;
  createdAt: string;
};

export type HistoryRow = {
  season: number;
  championId: string | null;
  championTeam: string | null;
  runnerUpId: string | null;
  runnerUpTeam: string | null;
  championScore: number | null;
  runnerUpScore: number | null;
  completedAt: string;
};

export type LeagueSnapshot = {
  me: string;
  league: {
    id: string;
    name: string;
    code: string;
    status: LeagueStatus;
    season: number;
    seasonStart: string | null;
    seasonWeeks: number;
    playoffTeams: number;
    maxMembers: number;
    timezone: string;
    scoring: Scoring;
    commissionerId: string;
    version: number;
    today: string;
    currentWeek: number | null;
    totalWeeks: number;
  };
  members: Member[];
  week: {
    number: number;
    start: string;
    end: string;
    status: WeekStatus;
    label: string;
    daysLeft: number;
  } | null;
  matchups: MatchupView[];
  totals: Record<string, WeekTotal>;
  days: Record<string, DayScore[]>;
  standings: Standing[];
  schedule: Matchup[];
  history: HistoryRow[];
  feed: FeedItem[];
  messages: ChatMessage[];
  /** All-time head-to-head record vs this week's opponent, from my point of view. */
  series: { opponentId: string; wins: number; losses: number; ties: number } | null;
};

export type ChatMessage = { id: string; userId: string; body: string; createdAt: string };

export type Workout = {
  id: string;
  activity_type: string;
  category: Category;
  activity_date: string;
  duration_min: number | null;
  steps: number | null;
  distance_km: number | null;
  notes: string | null;
  source: "manual" | "apple_health" | "health_connect";
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: string;
  email: string;
  display_name: string;
  team_name: string;
  team_abbr: string;
  team_color: string;
  timezone: string;
  share_details: boolean;
  created_at: string;
  avatar_updated_at: string | null;
  pledged_at: string | null;
};

export type MeResponse = {
  account: Account;
  today: string;
  leagues: { id: string; name: string; status: LeagueStatus; role: string; members: number }[];
  goal: { active_minutes: number; steps: number; effective_from: string | null };
  pendingGoal: { active_minutes: number; steps: number; effective_from: string } | null;
  plans: { plan_date: string; category: Category; target_minutes: number }[];
};
