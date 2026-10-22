-- סכמת מסד נתונים Supabase מלאה עבור bakshu-vibe (אזור eu-central-1)
-- הרץ סקריפט זה ב-Supabase -> SQL Editor כדי להפעיל את כל התכונות וההרשאות

-- 1. טבלת תלמידים ומשתתפים
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

-- הוספת עמודות תומכות אם הטבלה כבר נוצרה בעבר
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '1234';
ALTER TABLE users ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS present_today BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS persistence_count INT DEFAULT 0;

-- 2. הגדרות המבצע וחוקי בונוס
CREATE TABLE IF NOT EXISTS campaign_config (
  id INT PRIMARY KEY DEFAULT 1,
  campaign_name TEXT DEFAULT 'מבצע חורף - ישיבת בקשו',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '28 days'),
  min_target_score INT NOT NULL DEFAULT 110,
  full_seder_threshold INT NOT NULL DEFAULT 18,
  full_seder_bonus_pts INT NOT NULL DEFAULT 4,
  xy_required_count INT NOT NULL DEFAULT 5,
  xy_window_size INT NOT NULL DEFAULT 10,
  xy_bonus_pts INT NOT NULL DEFAULT 3,
  admin_password TEXT NOT NULL DEFAULT 'bakshu2026',
  targets_json JSONB DEFAULT NULL,
  duties_roster JSONB DEFAULT NULL,
  journey_stops JSONB DEFAULT NULL,
  bonus_config JSONB DEFAULT NULL,
  qr_secret TEXT DEFAULT 'BK-892'
);

ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS admin_password TEXT DEFAULT 'bakshu2026';
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS targets_json JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS duties_roster JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS journey_stops JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS bonus_config JSONB DEFAULT NULL;
ALTER TABLE campaign_config ADD COLUMN IF NOT EXISTS qr_secret TEXT DEFAULT 'BK-892';

-- 3. רשימת האירועים והסדרים בלוח השנה
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

-- 4. רישומי נוכחות ובקשות "שכחתי לסמן"
CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  slot_id UUID,
  student_name TEXT DEFAULT '',
  slot_title TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved',
  reason TEXT DEFAULT '',
  marked_by UUID,
  marked_at TIMESTAMPTZ DEFAULT now()
);

-- 5. יומן בונוסים מיוחדים
CREATE TABLE IF NOT EXISTS manager_bonus_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_name TEXT DEFAULT '',
  points INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  awarded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. טבלת סנכרון מהיר לכל מצב האפליקציה (Key-Value State Synchronization)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. ביטול חסימות אבטחה (RLS) ומעבר למצב קריאה/כתיבה מלא למשתתפי המבצע
ALTER TABLE campaign_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE manager_bonus_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_state DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
