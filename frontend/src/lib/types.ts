export type HabitFrequency = "daily" | "weekly" | "monthly";

export type Habit = {
  id: number;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  schedule_detail: number | null;
  is_active: boolean;
  is_base: boolean;
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_weekdays: number[];
  created_at: string;
};

export type User = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  timezone: string;
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
  recovery_hours: number;
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
  sleep_bedtime: string | null;
  sleep_wakeup: string | null;
  energy: number | null;
  mood: number | null;
  body_condition: number | null;
  created_at: string;
  updated_at: string;
};

export type HabitSummary = {
  habit_id: number;
  habit_name: string;
  avg_score_30d: number | null;
  current_streak_days: number;
};

export type StateSummary = {
  avg_energy_7d: number | null;
  avg_energy_30d: number | null;
  avg_mood_7d: number | null;
  avg_mood_30d: number | null;
  avg_body_condition_7d: number | null;
  avg_body_condition_30d: number | null;
};

export type ReportSummary = {
  avg_day_score_7d: number | null;
  avg_day_score_30d: number | null;
  habits: HabitSummary[];
  state: StateSummary;
};

export type DayScorePoint = {
  entry_date: string;
  day_score: number | null;
  energy: number | null;
  mood: number | null;
  body_condition: number | null;
  sleep_score: number | null;
};

export type TagImpact = {
  tag: string;
  avg_score_with_tag: number | null;
  avg_score_without_tag: number | null;
  days_with_tag: number;
};

export type VoiceTranscription = {
  text: string | null;
  tags: string[];
  sleep_bedtime: string | null;
  sleep_wakeup: string | null;
  energy: number | null;
  mood: number | null;
  body_condition: number | null;
  transcript: string;
  used_raw_transcript: boolean;
};

export type DiaryTag = {
  id: number;
  name: string;
  is_base: boolean;
};

export type TelegramLinkOut = {
  linked: boolean;
  link_code: string | null;
  deep_link: string | null;
};

export type TelegramStatusOut = {
  linked: boolean;
};

export type ManualCryptoTrade = {
  id: number;
  portfolio_name: string;
  currency: string;
  trade_date: string;
  side: "buy" | "sell";
  quantity: number;
  price_usdt: number;
  fee_usdt: number | null;
  note: string | null;
  created_at: string;
};

export type UnifiedCryptoTrade = {
  source: "auto" | "manual";
  manual_id: number | null;
  trade_date: string;
  side: "buy" | "sell";
  quantity: number;
  price_usdt: number;
  fee_usdt: number;
  note: string | null;
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
  portfolio_name: string;
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
  portfolio_name: string;
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
  usd_rub: number;
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
  invested_amount_rub: number | null;
  dividends_received_rub: number | null;
};

export type SleepPoint = {
  entry_date: string;
  sleep_hours: number;
  day_score: number | null;
};

export type SleepSummary = {
  avg_sleep_hours: number | null;
  avg_bedtime: string | null;
  avg_wakeup: string | null;
  days_with_data: number;
  score_by_quality: Record<string, number | null>;
  points: SleepPoint[];
};

export type MonthlyIncome = {
  month: string;
  total_rub: number;
};

export type DiversificationSlice = {
  label: string;
  value_rub: number;
  pct: number;
};

export type DiversificationBreakdown = {
  by_currency: DiversificationSlice[];
  by_source: DiversificationSlice[];
  by_sector: DiversificationSlice[];
  by_asset_class?: DiversificationSlice[];
};

export type SectorDetail = {
  sector: string;
  value_rub: number;
  pct: number;
  positions: BrokerPosition[];
};

export type AssetDetail = {
  ticker: string;
  name: string;
  instrument_type: string;
  sector: string | null;
  currency: string;
  quantity: number;
  average_price: number;
  current_price: number;
  position_value_rub: number;
  cost_basis_rub: number;
  unrealized_pnl_rub: number;
  unrealized_pnl_pct: number;
  portfolio_weight_pct: number;
  upcoming_dividends: DividendEvent[];
  annual_income_rub: number;
  yield_on_cost_pct: number;
};

export type MuscleReadiness = {
  group: string;
  last_trained: string;
  days_since: number;
  base_recovery_hours: number;
  recovery_hours: number;
  sets_last_session: number;
  typical_sets: number;
  readiness_pct: number;
  ready_in_days: number;
};

export type GroupLoad = {
  group: string;
  sessions: number;
  sets: number;
  volume: number;
  share_pct: number;
};

export type WeeklyLoad = {
  week_start: string;
  sets: number;
  volume: number;
  sessions: number;
};

export type ExerciseProgress = {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  best_weight: number | null;
  best_weight_date: string | null;
  recent_best: number | null;
  previous_best: number | null;
  delta: number | null;
  last_done: string;
  sessions: number;
  sets: number;
  stale: boolean;
};

export type SportFrequency = {
  sessions_30d: number;
  sessions_per_week: number;
  longest_gap_days: number | null;
  days_since_last: number | null;
};

export type SportReport = {
  readiness: MuscleReadiness[];
  load_30d: GroupLoad[];
  weekly: WeeklyLoad[];
  exercises: ExerciseProgress[];
  frequency: SportFrequency;
};

// --- Финансы: бюджет месяца -------------------------------------------------

export type MonthItem = {
  item_id: number;
  name: string;
  planned: number | null;
  actual: number;
  /** План минус факт для расходов и факт минус план для доходов — плюс всегда «хорошо». */
  difference: number | null;
  percent_of_income: number | null;
  transactions: number;
  in_plan: boolean;
};

export type MonthGroup = {
  group_id: number;
  name: string;
  kind: "income" | "expense";
  counts_as_savings: boolean;
  items: MonthItem[];
  planned: number;
  actual: number;
  difference: number;
};

export type MonthView = {
  month: string;
  income: MonthGroup[];
  expenses: MonthGroup[];
  planned_income: number;
  actual_income: number;
  planned_expenses: number;
  actual_expenses: number;
  planned_balance: number;
  actual_balance: number;
  balance_difference: number;
  is_empty: boolean;
  previous_month: string | null;
};

export type FinanceItem = {
  id: number;
  group_id: number;
  name: string;
  sort_order: number;
  archived: boolean;
};

export type FinanceGroup = {
  id: number;
  name: string;
  kind: "income" | "expense";
  sort_order: number;
  counts_as_savings: boolean;
  archived: boolean;
  items: FinanceItem[];
};

export type FinanceTransaction = {
  id: number;
  item_id: number;
  happened_on: string;
  amount: number;
  note: string | null;
  /** "xlsx" — строка пришла из импортированного файла, null — внесена руками. */
  source: string | null;
};

export type MonthTotals = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  savings: number;
  savings_rate: number | null;
};

export type GroupSlice = {
  group: string;
  actual: number;
  planned: number;
  share_pct: number;
};

export type GroupTrendPoint = {
  month: string;
  values: Record<string, number>;
};

export type ItemStat = {
  item_id: number;
  name: string;
  group: string;
  actual: number;
  planned: number | null;
  difference: number | null;
  average_3m: number | null;
  months_with_spend: number;
};

export type FinanceAnalytics = {
  months: MonthTotals[];
  by_group: GroupSlice[];
  group_trend: GroupTrendPoint[];
  top_items: ItemStat[];
  overspent: ItemStat[];
  reference_month: string;
};

export type SavingsAccount = {
  id: number;
  name: string;
  goal_amount: number | null;
  goal_date: string | null;
  sort_order: number;
  archived: boolean;
  balance: number;
  contributed: number;
  withdrawn: number;
  interest: number;
  goal_progress_pct: number | null;
  monthly_needed: number | null;
  last_operation_on: string | null;
};

export type SavingsSummary = {
  accounts: SavingsAccount[];
  total_balance: number;
  total_goal: number | null;
};

export type SavingsOperation = {
  id: number;
  happened_on: string;
  amount: number;
  kind: "contribution" | "withdrawal" | "interest";
  note: string | null;
};

// --- Финансы: импорт банковской выписки -------------------------------------

export type UnmappedCategory = {
  category: string;
  /** "out" — деньги ушли, "in" — пришли. Категория значит разное по сторонам. */
  direction: "out" | "in";
  count: number;
  total: number;
  examples: string[];
};

export type StatementResult = {
  rows: number;
  imported: number;
  duplicates: number;
  ignored: number;
  period_from: string | null;
  period_to: string | null;
  unmapped: UnmappedCategory[];
};

export type ImportRule = {
  id: number;
  bank: string;
  category: string;
  direction: "out" | "in";
  item_id: number | null;
  savings_account_id: number | null;
  ignored: boolean;
};
