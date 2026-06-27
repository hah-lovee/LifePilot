export type HabitFrequency = "daily" | "weekly" | "monthly";

export type Habit = {
  id: number;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  schedule_detail: number | null;
  is_active: boolean;
  is_base: boolean;
  created_at: string;
};

export type User = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
};

export type UserAdmin = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type MuscleGroup = {
  id: number;
  name: string;
};

export type Exercise = {
  id: number;
  name: string;
  description: string | null;
  muscle_group: string | null;
  photo_url: string | null;
  created_at: string;
};

export type ExerciseLog = {
  id: number;
  exercise_id: number;
  log_date: string;
  weight: number | null;
  reps: number | null;
};

export type HabitLog = {
  id: number;
  habit_id: number;
  log_date: string;
  score: number;
  note: string | null;
};

export type DiaryEntry = {
  id: number;
  entry_date: string;
  content: string | null;
  tags: string[];
  day_score: number | null;
  created_at: string;
  updated_at: string;
};

export type HabitSummary = {
  habit_id: number;
  habit_name: string;
  avg_score_30d: number | null;
  current_streak_days: number;
};

export type ReportSummary = {
  avg_day_score_7d: number | null;
  avg_day_score_30d: number | null;
  habits: HabitSummary[];
};

export type DayScorePoint = {
  entry_date: string;
  day_score: number | null;
};

export type TagImpact = {
  tag: string;
  avg_score_with_tag: number | null;
  avg_score_without_tag: number | null;
  days_with_tag: number;
};

export type DiaryTag = {
  id: number;
  name: string;
  is_base: boolean;
};

export type WalletBalance = {
  currency: string;
  total: number;
  free: number;
  used: number;
  value_usdt: number | null;
  average_price: number | null;
  pnl_usdt: number | null;
  pnl_percent: number | null;
};

export type ExchangeBalance = {
  source_type: "crypto";
  exchange: string;
  status: string;
  balances: WalletBalance[];
  error: string | null;
};

export type BrokerPosition = {
  ticker: string;
  name: string;
  instrument_type: string;
  quantity: number;
  average_price: number;
  current_price: number;
  current_value: number;
  currency: string;
  pnl_rub: number | null;
  pnl_percent: number | null;
  sector: string | null;
};

export type BrokerPortfolio = {
  source_type: "broker";
  broker: string;
  account_id: string;
  account_name: string;
  total_value: number;
  currency: string;
  positions: BrokerPosition[];
  status: string;
  error: string | null;
};

export type InvestmentsSummary = {
  crypto: ExchangeBalance[];
  brokers: BrokerPortfolio[];
};

export type DividendEvent = {
  ticker: string;
  name: string;
  instrument_type: string;
  payment_date: string;
  amount_per_unit: number;
  currency: string;
  quantity_held: number;
  total_amount: number;
};

export type NetWorthPoint = {
  snapshot_date: string;
  total_value_rub: number;
  crypto_value_rub: number;
  broker_value_rub: number;
};

export type DiversificationSlice = {
  label: string;
  value_rub: number;
};

export type DiversificationBreakdown = {
  by_currency: DiversificationSlice[];
  by_source: DiversificationSlice[];
  by_sector: DiversificationSlice[];
};
