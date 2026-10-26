-- סקריפט SQL מקיף להפעלת כל העמודות וההרשאות ב-Supabase (ללא מחיקת נתונים קיימים!)
-- יש להעתיק סקריפט זה ל-Supabase -> SQL Editor וללחוץ Run

-- 1. טבלת משתמשים ותלמידים (users)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS present_today BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '1234';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS persistence_count INT DEFAULT 0;

-- 2. טבלת רישומי נוכחות (attendance_logs)
ALTER TABLE IF EXISTS attendance_logs ADD COLUMN IF NOT EXISTS slot_title TEXT DEFAULT '';
ALTER TABLE IF EXISTS attendance_logs ADD COLUMN IF NOT EXISTS student_name TEXT DEFAULT '';
ALTER TABLE IF EXISTS attendance_logs ADD COLUMN IF NOT EXISTS points_earned INT DEFAULT 1;
ALTER TABLE IF EXISTS attendance_logs ADD COLUMN IF NOT EXISTS no_phone BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS attendance_logs ADD COLUMN IF NOT EXISTS slot_date DATE DEFAULT CURRENT_DATE;

-- 3. טבלת הגדרות מבצע (campaign_config)
ALTER TABLE IF EXISTS campaign_config ADD COLUMN IF NOT EXISTS admin_password TEXT DEFAULT '1234';
ALTER TABLE IF EXISTS campaign_config ADD COLUMN IF NOT EXISTS qr_secret TEXT DEFAULT 'BK-892';
ALTER TABLE IF EXISTS campaign_config ADD COLUMN IF NOT EXISTS targets_json JSONB DEFAULT NULL;
ALTER TABLE IF EXISTS campaign_config ADD COLUMN IF NOT EXISTS journey_stops JSONB DEFAULT NULL;
ALTER TABLE IF EXISTS campaign_config ADD COLUMN IF NOT EXISTS bonus_config JSONB DEFAULT NULL;

-- 4. טבלת בקשות נוכחות ואישורים (attendance_requests)
CREATE TABLE IF NOT EXISTS attendance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID,
  student_name TEXT DEFAULT '',
  slot_title TEXT DEFAULT '',
  date_str TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. טבלת מצב אפליקציה כללי (app_state)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. פתיחה מוחלטת של כל ההרשאות (ביטול חסימות RLS)
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS manager_bonus_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_calendar DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_requests DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
