-- =====================================================================
-- סכמת מסד נתונים Supabase מלאה ומאוחדת עבור bakshu-vibe (עד הפסגה)
-- הרץ סקריפט זה ב-Supabase -> SQL Editor (בטוח להרצה חוזרת ללא איבוד מידע)
-- =====================================================================

-- 1. טבלת תלמידים ומשתתפים (users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  password TEXT DEFAULT '1234',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  score INT NOT NULL DEFAULT 0,
  present_today BOOLEAN NOT NULL DEFAULT false,
  persistence_count INT NOT NULL DEFAULT 0,
  manual_bonus_pts INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '1234';
ALTER TABLE users ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS present_today BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS persistence_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manual_bonus_pts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. הגדרות המבצע, יעדי ניקוד, תחנות עצירה וחוקי בונוס (campaign_config)
CREATE TABLE IF NOT EXISTS campaign_config (
  id INT PRIMARY KEY DEFAULT 1,
  campaign_name TEXT DEFAULT 'מבצע חורף תשפ״ז - עד הפסגה',
  start_date DATE NOT NULL DEFAULT '2026-10-25',
  end_date DATE NOT NULL DEFAULT '2027-02-08',
  min_target_score INT NOT NULL DEFAULT 100,
  full_seder_threshold INT NOT NULL DEFAULT 10,
  full_seder_bonus_pts INT NOT NULL DEFAULT 2,
  xy_required_count INT NOT NULL DEFAULT 8,
  xy_window_size INT NOT NULL DEFAULT 10,
  xy_bonus_pts INT NOT NULL DEFAULT 3,
  admin_password TEXT NOT NULL DEFAULT '1234',
  targets_json JSONB DEFAULT NULL,
  duties_roster JSONB DEFAULT NULL,
  journey_stops JSONB DEFAULT NULL,
  bonus_config JSONB DEFAULT NULL
);

ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS admin_password TEXT DEFAULT '1234';
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS targets_json JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS duties_roster JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS journey_stops JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS bonus_config JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS full_seder_threshold INT DEFAULT 10;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS full_seder_bonus_pts INT DEFAULT 2;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS xy_required_count INT DEFAULT 8;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS xy_window_size INT DEFAULT 10;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS xy_bonus_pts INT DEFAULT 3;

-- 3. רשימת הסדרים בלוח השנה (schedule_slots)
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

-- 4. רישומי נוכחות בסדרים (attendance_logs)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  slot_id UUID,
  student_name TEXT DEFAULT '',
  slot_title TEXT DEFAULT '',
  slot_date DATE,
  points_earned INT DEFAULT 1,
  no_phone BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'approved',
  reason TEXT DEFAULT '',
  marked_by UUID,
  marked_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS student_name TEXT DEFAULT '';
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS slot_title TEXT DEFAULT '';
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS slot_date DATE;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS points_earned INT DEFAULT 1;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS no_phone BOOLEAN DEFAULT false;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';

-- 5. לוח שנה, תורנויות ואירועים מיוחדים (campaign_calendar)
CREATE TABLE IF NOT EXISTS campaign_calendar (
  iso_date DATE PRIMARY KEY,
  greg_label TEXT DEFAULT '',
  greg_full TEXT DEFAULT '',
  day_of_week INT DEFAULT 0,
  day_name_he TEXT DEFAULT '',
  day_name TEXT DEFAULT '',
  hebrew_date TEXT DEFAULT '',
  wakeup_student_id UUID,
  kitchen_student_id UUID,
  wakeup_done BOOLEAN DEFAULT false,
  kitchen_done BOOLEAN DEFAULT false,
  special_event_title TEXT DEFAULT '',
  station_title TEXT DEFAULT '',
  sedarim_count INT DEFAULT 3,
  points_pool INT DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS wakeup_student_id UUID;
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS kitchen_student_id UUID;
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS wakeup_done BOOLEAN DEFAULT false;
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS kitchen_done BOOLEAN DEFAULT false;
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS special_event_title TEXT DEFAULT '';
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS station_title TEXT DEFAULT '';
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS sedarim_count INT DEFAULT 3;
ALTER TABLE campaign_calendar ADD COLUMN IF NOT EXISTS points_pool INT DEFAULT 3;

-- 6. בקשות אישור "שכחתי לסמן" (attendance_requests)
CREATE TABLE IF NOT EXISTS attendance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID,
  student_name TEXT DEFAULT '',
  slot_title TEXT DEFAULT '',
  date_str TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. יומן בונוסים מיוחדים מראש הישיבה (manager_bonus_logs)
CREATE TABLE IF NOT EXISTS manager_bonus_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_name TEXT DEFAULT '',
  points INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  awarded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. ביטול חסימות אבטחת שורה (RLS) ומתן הרשאות קריאה וכתיבה מלאות
ALTER TABLE campaign_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_calendar DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE manager_bonus_logs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
