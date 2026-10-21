-- סכמת מסד נתונים Supabase עבור "עד הפסגה - מבצע חורף תשפ״ז" | ישיבת בקשו ירושלים
-- אזור: eu-central-1

-- 1. הגדרות המבצע, מיתוג וערכי הבונוסים (בשליטת ראש הישיבה)
CREATE TABLE IF NOT EXISTS campaign_config (
  id INT PRIMARY KEY DEFAULT 1,
  campaign_name TEXT DEFAULT 'עד הפסגה - מבצע חורף תשפ״ז',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '28 days'),
  bronze_mystery_target INT NOT NULL DEFAULT 75,   -- יעד מתנה 1 (חסוי)
  silver_mystery_target INT NOT NULL DEFAULT 110,  -- יעד מתנה 2 (חסוי)
  gold_mystery_target INT NOT NULL DEFAULT 140,    -- מתנת הפסגה (חסוי)
  full_seder_threshold INT NOT NULL DEFAULT 18,
  full_seder_bonus_pts INT NOT NULL DEFAULT 4,
  xy_required_count INT NOT NULL DEFAULT 5,
  xy_window_size INT NOT NULL DEFAULT 10,
  xy_bonus_pts INT NOT NULL DEFAULT 3,
  no_phone_bonus_pts INT NOT NULL DEFAULT 1,       -- בונוס סדר ללא טלפון 📵
  wakeup_duty_bonus_pts INT NOT NULL DEFAULT 3,    -- בונוס תורנות מעורר ⏰
  kitchen_duty_bonus_pts INT NOT NULL DEFAULT 3,   -- בונוס תורנות ניקיון מטבח 🧹
  active_qr_secret TEXT NOT NULL DEFAULT '7704',   -- קוד QR בהחלטת ראש הישיבה
  admin_password TEXT NOT NULL DEFAULT 'bakshu2026'
);

-- 2. רשימת המשתתפים (תלמידים ומנהלים)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT DEFAULT '1234',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  manual_bonus_pts INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ציר ב׳: נקודות העצירה במסע "עד הפסגה" (אירועים בלוח השנה)
CREATE TABLE IF NOT EXISTS journey_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_index INT NOT NULL,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  date_label TEXT NOT NULL,
  slogan TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. לוח תורנויות מעורר ומטבח בלוח השנה
CREATE TABLE IF NOT EXISTS duties_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date DATE NOT NULL,
  day_label TEXT NOT NULL,
  wakeup_student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wakeup_done BOOLEAN NOT NULL DEFAULT false,
  wakeup_reminder_time TEXT DEFAULT 'לילה קודם (22:30)',
  kitchen_student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kitchen_done BOOLEAN NOT NULL DEFAULT false,
  kitchen_reminder_time TEXT DEFAULT 'לקראת ערב (19:30)',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(duty_date)
);

-- 5. רשימת האירועים והסדרים בלוח השנה
CREATE TABLE IF NOT EXISTS schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date DATE NOT NULL,
  title TEXT NOT NULL,
  time_window TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  lock_time TIMESTAMPTZ NOT NULL,
  base_points INT NOT NULL DEFAULT 1,
  full_seder_achieved BOOLEAN NOT NULL DEFAULT false
);

-- 6. רישומי נוכחות, "סדר ללא טלפון" ובקשות אישור
CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES schedule_slots(id) ON DELETE CASCADE,
  no_phone_marked BOOLEAN NOT NULL DEFAULT false,  -- האם הסדר היה ללא טלפון
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  marked_by UUID REFERENCES users(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slot_id)
);

-- 7. יומן בונוסים מיוחדים לפי דעת ראש הישיבה
CREATE TABLE IF NOT EXISTS manager_bonus_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  points INT NOT NULL,
  reason TEXT NOT NULL,
  awarded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security (RLS) policies
ALTER TABLE campaign_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE duties_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_bonus_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for active campaign config" ON campaign_config FOR SELECT USING (true);
CREATE POLICY "Allow public update for campaign config" ON campaign_config FOR UPDATE USING (true);
CREATE POLICY "Allow public read for active users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert for users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update for users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow public read for journey stops" ON journey_stops FOR SELECT USING (true);
CREATE POLICY "Allow public read and write for duties" ON duties_roster FOR ALL USING (true);
CREATE POLICY "Allow public read for schedule slots" ON schedule_slots FOR SELECT USING (true);
CREATE POLICY "Allow users to read their own attendance" ON attendance_logs FOR SELECT USING (true);
CREATE POLICY "Allow users to insert their attendance" ON attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read and insert for manager bonuses" ON manager_bonus_logs FOR ALL USING (true);
