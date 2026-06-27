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

export type Exercise = {
  id: number;
  name: string;
  description: string | null;
  muscle_group: string | null;
  photo_url: string | null;
  is_base: boolean;
  created_at: string;
};

export type ExerciseLog = {
  id: number;
  exercise_id: number;
  log_date: string;
  weight: number | null;
  reps: number | null;
  sets: number;
  note: string | null;
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
