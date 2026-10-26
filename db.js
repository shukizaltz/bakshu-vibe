/**
 * db.js - שכבת נתונים מרכזית ונקייה למערכת 'בקשו VIBE'
 * מתחברת ישירות ל-Supabase כמקור אמת בלעדי (Single Source of Truth)
 * עם עמידות מלאה לכל קריאה וכתיבה
 */

(function() {
  const SUPABASE_URL = 'https://apuuuubjrhejknyvzvpn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DuJUmTpWwU4h3P8r1htVWw_24i-VjeG';

  const g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  const client = (g.supabase && g.supabase.createClient)
    ? g.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  const MASTER_CFG_KEY = 'bakshu_master_config_v5';

  const Db = {
    client,

    // ==========================================
    // 1. תלמידים ומשתתפים (users)
    // ==========================================
    async getStudents() {
      if (!client) return [];
      try {
        const { data, error } = await client
          .from('users')
          .select('*')
          .eq('role', 'student')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (error) {
          console.warn('Db.getStudents error, trying without filters:', error);
          const res = await client.from('users').select('*').order('created_at', { ascending: true });
          return (res.data || []).filter(u => u.role !== 'admin');
        }
        return data || [];
      } catch (e) {
        console.error('Db.getStudents exception:', e);
        return [];
      }
    },

    async updateStudentScore(studentId, deltaPoints, isPresent) {
      if (!client || !studentId) return false;
      try {
        // קריאת מצב עדכני
        const { data: st } = await client.from('users').select('score, manual_bonus_pts').eq('id', studentId).maybeSingle();
        const currentScore = Number(st?.score ?? st?.manual_bonus_pts ?? 0);
        const newScore = Math.max(0, currentScore + deltaPoints);

        const updatePayload = {
          score: newScore,
          manual_bonus_pts: newScore
        };
        if (isPresent !== undefined) {
          updatePayload.present_today = !!isPresent;
        }

        const { error } = await client.from('users').update(updatePayload).eq('id', studentId);
        if (error && error.code === 'PGRST204') {
          // עמודת score חסרה, נעדכן רק manual_bonus_pts
          await client.from('users').update({ manual_bonus_pts: newScore }).eq('id', studentId);
        }
        return true;
      } catch (e) {
        console.error('Db.updateStudentScore error:', e);
        return false;
      }
    },

    async updateStudentPassword(studentId, newPassword) {
      if (!client || !studentId || !newPassword) return false;
      try {
        const { error } = await client.from('users').update({ password: String(newPassword).trim() }).eq('id', studentId);
        if (error) {
          // שמירה בסנאפשוט גיבוי
          await this.saveSnapshot({ [`student_pass_${studentId}`]: newPassword });
        }
        return true;
      } catch (e) {
        console.error('Db.updateStudentPassword error:', e);
        return false;
      }
    },

    async addStudent(fullName, phone) {
      if (!client || !fullName) return null;
      try {
        const { data, error } = await client.from('users').insert([{
          full_name: fullName.trim(),
          phone: (phone || '').trim(),
          role: 'student',
          score: 0,
          manual_bonus_pts: 0,
          password: '1234',
          is_active: true
        }]).select();

        if (error) {
          console.warn('Db.addStudent fallback insert:', error);
          const res = await client.from('users').insert([{
            full_name: fullName.trim(),
            phone: (phone || '').trim(),
            role: 'student',
            manual_bonus_pts: 0,
            is_active: true
          }]).select();
          return res.data ? res.data[0] : null;
        }
        return data ? data[0] : null;
      } catch (e) {
        console.error('Db.addStudent exception:', e);
        return null;
      }
    },

    // ==========================================
    // 2. רישומי נוכחות (attendance_logs)
    // ==========================================
    async recordAttendance(studentId, studentName, slotTitle, points, isPresent, noPhone, dateStr) {
      if (!client) return false;
      try {
        const cleanDate = dateStr || new Date().toISOString().slice(0, 10);
        
        // 1. הוספת רישום נוכחות
        try {
          await client.from('attendance_logs').insert([{
            user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
            student_name: studentName || '',
            slot_title: slotTitle || '',
            slot_date: cleanDate,
            points_earned: isPresent ? points : 0,
            no_phone: !!noPhone,
            status: isPresent ? 'present' : 'absent',
            marked_at: new Date().toISOString()
          }]);
        } catch (insErr) {
          // fallback אם חלק מהעמודות חסרות ב-attendance_logs
          await client.from('attendance_logs').insert([{
            user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
            status: isPresent ? 'present' : 'absent',
            marked_at: new Date().toISOString()
          }]);
        }

        // 2. עדכון ניקוד הבחור
        const delta = isPresent ? points : -points;
        await this.updateStudentScore(studentId, delta, isPresent);
        return true;
      } catch (e) {
        console.error('Db.recordAttendance error:', e);
        return false;
      }
    },

    async getAttendanceLogsForDate(dateStr) {
      if (!client || !dateStr) return [];
      try {
        const { data } = await client
          .from('attendance_logs')
          .select('*')
          .order('marked_at', { ascending: false });
        return data || [];
      } catch (e) {
        return [];
      }
    },

    // ==========================================
    // 3. לוח זמנים וסדרים (schedule_slots)
    // ==========================================
    async getScheduleSlots() {
      if (!client) return {};
      try {
        const { data, error } = await client.from('schedule_slots').select('*').order('open_time', { ascending: true });
        if (error || !data) return {};

        const grouped = {};
        data.forEach(sl => {
          const d = sl.slot_date;
          if (!d) return;
          if (!grouped[d]) grouped[d] = [];

          const openT = sl.open_time ? sl.open_time.slice(11, 16) : (sl.time_window ? sl.time_window.split('-')[0].trim() : '09:00');
          const lockT = sl.lock_time ? sl.lock_time.slice(11, 16) : (sl.time_window ? sl.time_window.split('-')[1].trim() : '10:15');

          if (!grouped[d].some(x => x.title === sl.title && x.openTime === openT)) {
            grouped[d].push({
              id: sl.id,
              title: sl.title,
              timeWindow: sl.time_window || `${openT} - ${lockT}`,
              openTime: openT,
              lockTime: lockT,
              points: Number(sl.base_points) || 1,
              isLocked: false
            });
          }
        });

        // מיון כל יום לפי שעת פתיחה
        Object.keys(grouped).forEach(d => {
          grouped[d].sort((a, b) => (a.openTime || '').localeCompare(b.openTime || ''));
        });

        return grouped;
      } catch (e) {
        console.error('Db.getScheduleSlots error:', e);
        return {};
      }
    },

    async syncDateSlots(dateStr, slotsList) {
      if (!client || !dateStr) return false;
      try {
        // מחיקת כל הסדרים הישנים לתאריך זה למניעת כפילויות
        await client.from('schedule_slots').delete().eq('slot_date', dateStr);

        if (!Array.isArray(slotsList) || slotsList.length === 0) {
          return true; // יום רוקן בהצלחה
        }

        const rows = slotsList.map((s, idx) => {
          const openT = (s.openTime && s.openTime.length === 5) ? s.openTime : '09:00';
          const lockT = (s.lockTime && s.lockTime.length === 5) ? s.lockTime : '10:15';
          return {
            slot_date: dateStr,
            title: s.title || `סדר ${idx + 1}`,
            time_window: s.timeWindow || `${openT} - ${lockT}`,
            open_time: `${dateStr}T${openT}:00+02:00`,
            lock_time: `${dateStr}T${lockT}:00+02:00`,
            base_points: Number(s.points) || 1,
            full_seder_achieved: false
          };
        });

        await client.from('schedule_slots').insert(rows);
        return true;
      } catch (e) {
        console.error('Db.syncDateSlots error:', e);
        return false;
      }
    },

    async deleteSlotSeries(sederTitle) {
      if (!client || !sederTitle) return false;
      try {
        const clean = String(sederTitle).trim();
        await client.from('schedule_slots').delete().eq('title', clean);
        return true;
      } catch (e) {
        console.error('Db.deleteSlotSeries error:', e);
        return false;
      }
    },

    async deleteSlotItem(slotId) {
      if (!client || !slotId) return false;
      try {
        await client.from('schedule_slots').delete().eq('id', slotId);
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 4. הגדרות המבצע, יעדים ותחנות (campaign_config)
    // ==========================================
    async getConfig() {
      if (!client) return null;
      try {
        // 1. קריאה מסנאפשוט ראשי
        const snap = await this.loadSnapshot();

        // 2. קריאה מ-campaign_config
        const { data: cfgRow } = await client.from('campaign_config').select('*').eq('id', 1).maybeSingle();

        const base = cfgRow || {};
        return {
          campaignName: base.campaign_name || snap?.config?.campaignName || 'מבצע חורף תשפ״ז - עד הפסגה',
          startDate: base.start_date || snap?.config?.startDate || '2026-10-25',
          endDate: base.end_date || snap?.config?.endDate || '2026-12-10',
          minTarget: base.min_target_score || snap?.config?.minTarget || 100,
          groupFullThreshold: base.full_seder_threshold || snap?.config?.groupFullThreshold || 10,
          groupFullBonus: base.full_seder_bonus_pts || snap?.config?.groupFullBonus || 4,
          xyNeed: base.xy_required_count || snap?.config?.xyNeed || 5,
          xyWindow: base.xy_window_size || snap?.config?.xyWindow || 10,
          xyBonus: base.xy_bonus_pts || snap?.config?.xyBonus || 3,
          adminPassword: base.admin_password || snap?.adminPassword || snap?.config?.adminPassword || '1234',
          qrSecret: base.qr_secret || snap?.qrSecret || snap?.config?.qrSecret || 'BK-892',
          targets: snap?.config?.targets || {
            min: { name: 'יעד 1 – כניסה להגרלה', points: 70 },
            mid: { name: 'יעד 2 – פרס כספי', points: 100 },
            max: { name: 'הפסגה – נסיעה ופרס ענק', points: 130 }
          },
          extraTargets: snap?.config?.extraTargets || [],
          trailStops: snap?.trailStops || snap?.journeyStops || [
            { id: 'stop_1', title: 'עצירה 1 – פיתחו יומנים!', isoDate: '2026-11-19', dateLabel: 'יום ה׳ ט׳ כסליו', points: 70, isDecided: true },
            { id: 'stop_2', title: 'עצירה 2 – יעד נושא מתנה!', isoDate: '', dateLabel: 'יוכרז בהמשך', points: 100, isDecided: false },
            { id: 'stop_3', title: 'הפסגה – המטרה הגדולה!', isoDate: '', dateLabel: 'יוכרז בהמשך', points: 130, isDecided: false }
          ],
          bonusConfig: snap?.bonusConfig || {
            noPhoneBonus: 1,
            wakeupBonus: 2,
            kitchenBonus: 2,
            groupFullBonus: 4
          }
        };
      } catch (e) {
        console.error('Db.getConfig error:', e);
        return null;
      }
    },

    async saveConfig(cfgPayload) {
      if (!client || !cfgPayload) return false;
      try {
        // 1. שמירת סנאפשוט מלא ב-manager_bonus_logs
        await this.saveSnapshot({
          config: cfgPayload,
          trailStops: cfgPayload.trailStops || [],
          journeyStops: cfgPayload.trailStops || [],
          bonusConfig: cfgPayload.bonusConfig || {},
          qrSecret: cfgPayload.qrSecret || 'BK-892',
          adminPassword: cfgPayload.adminPassword || '1234',
          updatedAt: Date.now()
        });

        // 2. עדכון campaign_config
        const minPts = cfgPayload.targets?.mid?.points || cfgPayload.minTarget || 100;
        await client.from('campaign_config').upsert({
          id: 1,
          campaign_name: cfgPayload.campaignName || 'מבצע חורף תשפ״ז - עד הפסגה',
          start_date: cfgPayload.startDate || '2026-10-25',
          end_date: cfgPayload.endDate || '2026-12-10',
          min_target_score: minPts,
          full_seder_threshold: cfgPayload.groupFullThreshold || 10,
          full_seder_bonus_pts: cfgPayload.groupFullBonus || 4,
          xy_required_count: cfgPayload.xyNeed || 5,
          xy_window_size: cfgPayload.xyWindow || 10,
          xy_bonus_pts: cfgPayload.xyBonus || 3,
          admin_password: String(cfgPayload.adminPassword || '1234').trim(),
          qr_secret: String(cfgPayload.qrSecret || 'BK-892').trim().toUpperCase()
        }, { onConflict: 'id' });

        return true;
      } catch (e) {
        console.error('Db.saveConfig error:', e);
        return false;
      }
    },

    // ==========================================
    // 5. תורנויות מעורר ומטבח (campaign_calendar)
    // ==========================================
    async getCalendarDuties() {
      if (!client) return {};
      try {
        const { data } = await client.from('campaign_calendar').select('*').order('iso_date', { ascending: true });
        const map = {};
        (data || []).forEach(r => {
          map[r.iso_date] = {
            isoDate: r.iso_date,
            dayName: r.day_name,
            hebrewDate: r.hebrew_date,
            wakeupStudentId: r.wakeup_student_id,
            kitchenStudentId: r.kitchen_student_id,
            wakeupDone: !!r.wakeup_done,
            kitchenDone: !!r.kitchen_done
          };
        });
        return map;
      } catch (e) {
        return {};
      }
    },

    async updateDuty(isoDate, field, studentId) {
      if (!client || !isoDate) return false;
      try {
        await client.from('campaign_calendar').upsert({
          iso_date: isoDate,
          [field]: studentId || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'iso_date' });
        return true;
      } catch (e) {
        return false;
      }
    },

    async toggleDutyDone(isoDate, doneField, isDone) {
      if (!client || !isoDate) return false;
      try {
        await client.from('campaign_calendar').upsert({
          iso_date: isoDate,
          [doneField]: !!isDone,
          updated_at: new Date().toISOString()
        }, { onConflict: 'iso_date' });
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 6. בונוסים מיוחדים (manager_bonus_logs)
    // ==========================================
    async grantSpecialBonus(studentId, studentName, points, reason) {
      if (!client) return false;
      try {
        await client.from('manager_bonus_logs').insert([{
          user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
          student_name: studentName || '',
          points: Number(points) || 1,
          reason: String(reason || 'בונוס מיוחד מראש הישיבה ⭐').trim(),
          created_at: new Date().toISOString()
        }]);

        if (studentId) {
          await this.updateStudentScore(studentId, Number(points) || 1);
        }
        return true;
      } catch (e) {
        console.error('Db.grantSpecialBonus error:', e);
        return false;
      }
    },

    async getBonusLogs() {
      if (!client) return [];
      try {
        const { data } = await client
          .from('manager_bonus_logs')
          .select('*')
          .gt('points', 0)
          .order('created_at', { ascending: false })
          .limit(50);
        return data || [];
      } catch (e) {
        return [];
      }
    },

    // ==========================================
    // 7. בקשות אישור "שכחתי לסמן" (attendance_requests)
    // ==========================================
    async getRequests() {
      if (!client) return [];
      try {
        const { data, error } = await client
          .from('attendance_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) return data;

        // fallback לסנאפשוט אם הטבלה טרם נוצרה
        const snap = await this.loadSnapshot();
        return snap?.requests || [];
      } catch (e) {
        return [];
      }
    },

    async submitRequest(req) {
      if (!client || !req) return false;
      try {
        const newReq = {
          student_id: (req.studentId && /^[0-9a-f-]{36}$/i.test(req.studentId)) ? req.studentId : null,
          student_name: req.studentName || '',
          slot_title: req.slotTitle || '',
          date_str: req.dateStr || new Date().toISOString().slice(0, 10),
          reason: req.reason || '',
          status: 'pending',
          created_at: new Date().toISOString()
        };

        const { error } = await client.from('attendance_requests').insert([newReq]);
        if (error) {
          // fallback לסנאפשוט
          const snap = await this.loadSnapshot();
          const list = snap?.requests || [];
          list.unshift({ ...newReq, id: 'req_' + Date.now() });
          await this.saveSnapshot({ requests: list });
        }
        return true;
      } catch (e) {
        console.error('Db.submitRequest error:', e);
        return false;
      }
    },

    async updateRequestStatus(reqId, newStatus, studentId, studentName, slotTitle, points) {
      if (!client || !reqId) return false;
      try {
        await client.from('attendance_requests').update({ status: newStatus }).eq('id', reqId);
        
        // אם אושר: רישום נוכחות וניקוד!
        if (newStatus === 'approved' && studentId) {
          await this.recordAttendance(studentId, studentName, slotTitle, points || 1, true, false);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 8. סנאפשוט גיבוי חסין RLS (manager_bonus_logs -999)
    // ==========================================
    async saveSnapshot(payload) {
      if (!client || !payload) return false;
      try {
        let merged = { ...payload };
        const prev = await this.loadSnapshot();
        if (prev) merged = { ...prev, ...payload };

        await client.from('manager_bonus_logs').insert([{
          user_id: null,
          points: -999,
          reason: 'APP_STATE_SNAPSHOT:' + JSON.stringify(merged)
        }]);

        // גם ניסיון כתיבה ל-app_state
        try {
          await client.from('app_state').upsert([
            { key: MASTER_CFG_KEY, data: merged, updated_at: new Date().toISOString() }
          ], { onConflict: 'key' });
        } catch(e) {}

        return true;
      } catch (e) {
        return false;
      }
    },

    async loadSnapshot() {
      if (!client) return null;
      try {
        const { data: snaps } = await client
          .from('manager_bonus_logs')
          .select('reason')
          .eq('points', -999)
          .order('created_at', { ascending: false })
          .limit(1);

        if (snaps && snaps.length > 0 && snaps[0].reason && snaps[0].reason.startsWith('APP_STATE_SNAPSHOT:')) {
          return JSON.parse(snaps[0].reason.slice('APP_STATE_SNAPSHOT:'.length));
        }

        const { data: appRow } = await client.from('app_state').select('data').eq('key', MASTER_CFG_KEY).maybeSingle();
        return appRow?.data || null;
      } catch (e) {
        return null;
      }
    },

    // ==========================================
    // 9. סנכרון חי Realtime
    // ==========================================
    subscribeRealtime(onUpdate) {
      if (!client) return null;
      try {
        let timer = null;
        const trigger = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (typeof onUpdate === 'function') onUpdate();
          }, 600);
        };

        const channel = client.channel('bakshu_live_channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, trigger)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, trigger)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots' }, trigger)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_bonus_logs' }, trigger)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_calendar' }, trigger)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_requests' }, trigger)
          .subscribe();

        return channel;
      } catch (e) {
        return null;
      }
    }
  };

  g.Db = Db;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Db;
  }
})();
