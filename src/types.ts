export type MatchStatus = "upcoming" | "live" | "finished" | "unknown";
export type MatchStatusFilter = "all" | "upcoming" | "live" | "finished";
export type PlayerColumn = "left" | "right" | "unknown";

export interface RunConfig {
  entryUrl: string;
  status: MatchStatusFilter;
  limit?: number;
  recentCount: number;
  headed: boolean;
  slowMo: number;
  timeoutMs: number;
  telegram: boolean;
  console: boolean;
  maxGotoRetries: number;
  telegramToken?: string;
  telegramChatId?: string;
  tgSendMaxRpm: number;
}

export interface DayMatchRef {
  id: string;
  url: string;
  playerAName: string;
  playerBName: string;
  isDoublesHint?: boolean;
  status: MatchStatus;
  scheduledStartText?: string;
  tournament?: string;
}

export interface PlayerRef {
  name: string;
  profileUrl?: string;
}

export interface MatchOdds {
  home?: number;
  away?: number;
  bookmaker?: string;
  stage?: string;
}

export type PclassSource = "match_dv_data" | "missing";

export interface PclassSnapshot {
  ev?: number;
  dep?: number;
  source: PclassSource;
}

export interface MatchPageRef {
  url: string;
  tournament?: string;
  status: MatchStatus;
  scheduledStartText?: string;
  isDoublesHint?: boolean;
  players: [PlayerRef, PlayerRef];
  marketOdds?: MatchOdds;
  pclass?: PclassSnapshot;
}

export interface RecentMatchRef {
  url: string;
  opponentName?: string;
  dateText?: string;
  tournament?: string;
  resultText?: string;
  matchId?: string;
  isSingles?: boolean;
  isDoublesHint?: boolean;
  isFinishedHint?: boolean;
  isFutureHint?: boolean;
  parsedAt?: string;
  scoreText?: string;
  leftPlayerLinksCount?: number;
  rightPlayerLinksCount?: number;
}

export interface MetricValue {
  raw: string;
  percent?: number;
  made?: number;
  total?: number;
}

export interface TechStatRow {
  section: string;
  metricLabel: string;
  metricKey: string;
  playerValue: MetricValue;
  opponentValue: MetricValue;
}

export interface HistoricalMatchTechStats {
  matchUrl: string;
  matchTitle?: string;
  playerName: string;
  sourcePlayerSide: PlayerColumn;
  rows: TechStatRow[];
  warnings: string[];
}

export interface PlayerRecentStats {
  playerName: string;
  profileUrl?: string;
  parsedMatches: HistoricalMatchTechStats[];
  missingStatsCount: number;
  historyScanStats?: HistoryScanStats;
  errors: string[];
}

export interface MatchContext {
  matchUrl: string;
  matchLabel: string;
  tournament?: string;
  status: MatchStatus;
  scheduledStartText?: string;
  playerAName: string;
  playerBName: string;
  marketOdds?: MatchOdds;
  pclass?: PclassSnapshot;
}

export interface PredictionResult {
  createdAt: string;
  matchUrl: string;
  matchLabel: string;
  tournament?: string;
  matchStatus?: MatchStatus;
  scheduledStartText?: string;
  playerAName?: string;
  playerBName?: string;
  marketOdds?: MatchOdds;
  predictedWinner: string;
  confidence: number;
  reason: string;
  statsCoverage: {
    requestedPerPlayer: number;
    playerACollected: number;
    playerBCollected: number;
  };
  timingsSec?: {
    collection: number;
    prediction: number;
    total: number;
  };
  dataStatus?: string;
  modelSummary?: PredictionModelSummary;
  warnings: string[];
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  processedMatches: number;
  predictedMatches: number;
  skippedMatches: number;
  parserErrors: number;
  telegramFailures: number;
}

export interface PredictionTransport {
  name: string;
  sendPrediction(prediction: PredictionResult): Promise<void>;
}

export interface HistoryScanStats {
  candidatePool: number;
  scanned: number;
  accepted: number;
  filtered: {
    sameAsTargetMatch: number;
    nonSingles: number;
    nonSinglesHistory: number;
    notFinished: number;
    future: number;
    invalid: number;
    techMissing: number;
    metricsIncomplete: number;
    parseError: number;
  };
}

export interface HistoryMetricRow {
  matchUrl: string;
  tpw12?: number;
  ssw12?: number;
  rpr12?: number;
  bpsr12?: number;
  bpconv12?: number;
  warnings: string[];
}

export interface CalibrationSummary {
  n: number;
  mean?: number;
  sd?: number;
}

export interface HistoryCalibration {
  ssw_12: CalibrationSummary;
  rpr_12: CalibrationSummary;
  bpsr_12: CalibrationSummary;
  bpconv_12: CalibrationSummary;
}

export type HistoryModuleSide = "home" | "away" | "neutral";

export interface HistoryModuleResult {
  name: string;
  side: HistoryModuleSide;
  strength: number;
  explain: string[];
  flags: string[];
}

export interface EnsembleMeta {
  finalSide: HistoryModuleSide;
  score: number;
  votesHome: number;
  votesAway: number;
  strongHome: number;
  strongAway: number;
  active: number;
}

export interface TPW12HistoryScore {
  n: number;
  mu_pp?: number;
  delta_pp?: number;
  sigma_pp?: number;
  power?: number;
  form?: number;
  volatility?: number;
  rating?: number;
  reliability: number;
  values: number[];
}

export interface PredictionModelSummary {
  modules: HistoryModuleResult[];
  ensemble: EnsembleMeta;
  rating5: {
    playerA?: number;
    playerB?: number;
  };
  reliability: {
    playerA: number;
    playerB: number;
  };
  dirt?: {
    validPairs: number;
    requestedPairs: number;
    modelProbabilities: {
      logRegP1?: number;
      markovP1?: number;
      bradleyP1?: number;
      pcaP1?: number;
      finalP1: number;
    };
    weights: {
      logReg: number;
      markov: number;
      bradley: number;
      pca: number;
    };
    stability?: {
      logReg?: number;
      markov?: number;
      bradley?: number;
      pca?: number;
    };
    pclass?: {
      ev?: number;
      dep?: number;
      source?: PclassSource;
    };
  };
  novaEdge?: {
    p1: number;
    p2: number;
    winner?: string;
    source: "stable14_nova_v1";
  };
}
