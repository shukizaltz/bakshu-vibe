-- סכמת מסד נתונים Supabase עבור bakshu-vibe (אזור eu-central-1)

-- 1. הגדרות המבצע וחוקי בונוס
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
  xy_bonus_pts INT NOT NULL DEFAULT 3
);

-- 2. רשימת המשתתפים (תלמידים ומנהל/אחראי)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  manual_bonus_pts INT NOT NULL DEFAULT 0, -- סך בונוסים חופשיים לפי דעת המנהל
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES schedule_slots(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  marked_by UUID REFERENCES users(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slot_id)
);

-- 5. יומן בונוסים חופשיים לפי דעת המנהל
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
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_bonus_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for active campaign config" ON campaign_config FOR SELECT USING (true);
CREATE POLICY "Allow public read for active users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public read for schedule slots" ON schedule_slots FOR SELECT USING (true);
CREATE POLICY "Allow users to read their own attendance" ON attendance_logs FOR SELECT USING (true);
CREATE POLICY "Allow users to insert their attendance" ON attendance_logs FOR INSERT WITH CHECK (true);
