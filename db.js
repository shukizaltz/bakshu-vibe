/**
 * db.js - שכבת נתונים ראשית מול שרת Supabase החי
 * Single Source of Truth - כל קריאה וכתיבה מתבצעות ישירות מול הטבלאות שאומתו בשרת
 */

(function() {
  const g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  const SUPABASE_URL = 'https://apuuuubjrhejknyvzvpn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DuJUmTpWwU4h3P8r1htVWw_24i-VjeG';

  const client = (g.supabase && g.supabase.createClient)
    ? g.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  const APP_STATE_KEY = 'bakshu_app_state_v1';

  const Db = {
    client,
    url: SUPABASE_URL,
    key: SUPABASE_KEY,

    // ==========================================
    // 1. תלמידים ומשתתפים (טבלת users)
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
          console.error('Db.getStudents error:', error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.error('Db.getStudents error:', e);
        return [];
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
          present_today: false,
          persistence_count: 0,
          is_active: true
        }]).select();

        if (error) {
          console.error('Db.addStudent error:', error);
          return null;
        }
        return data ? data[0] : null;
      } catch (e) {
        console.error('Db.addStudent exception:', e);
        return null;
      }
    },

    async updateStudentScore(studentId, deltaPoints, isPresent) {
      if (!client || !studentId) return false;
      try {
        const { data: st } = await client.from('users').select('score, manual_bonus_pts').eq('id', studentId).maybeSingle();
        const curScore = Number(st?.score ?? st?.manual_bonus_pts ?? 0);
        const newScore = Math.max(0, curScore + deltaPoints);

        const payload = {
          score: newScore,
          manual_bonus_pts: newScore
        };
        if (isPresent !== undefined) {
          payload.present_today = !!isPresent;
        }

        const { error } = await client.from('users').update(payload).eq('id', studentId);
        return !error;
      } catch (e) {
        console.error('Db.updateStudentScore error:', e);
        return false;
      }
    },

    async updateStudentPassword(studentId, newPassword) {
      if (!client || !studentId || !newPassword) return false;
      try {
        const { error } = await client.from('users').update({ password: String(newPassword).trim() }).eq('id', studentId);
        return !error;
      } catch (e) {
        console.error('Db.updateStudentPassword error:', e);
        return false;
      }
    },

    // ==========================================
    // 2. לוח זמנים וסדרים (טבלת schedule_slots)
    // ==========================================
    async getScheduleSlots() {
      if (!client) return {};
      try {
        const { data, error } = await client.from('schedule_slots').select('*').order('open_time', { ascending: true });
        
        const grouped = {};
        if (!error && Array.isArray(data)) {
          data.forEach(sl => {
            const d = sl.slot_date;
            if (!d) return;
            if (!grouped[d]) grouped[d] = [];

            // חילוץ מדויק של שעות מקומיות מ-time_window או משעון ישראל
            let openT = '09:00';
            let lockT = '10:15';
            if (sl.time_window && sl.time_window.includes('-')) {
              const parts = sl.time_window.split('-');
              openT = parts[0].trim();
              lockT = parts[1].trim();
            } else if (sl.open_time) {
              const dObj = new Date(sl.open_time);
              openT = dObj.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
              if (sl.lock_time) {
                const dLock = new Date(sl.lock_time);
                lockT = dLock.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
              }
            }

            if (!grouped[d].some(x => x.title === sl.title && x.openTime === openT)) {
              grouped[d].push({
                id: sl.id,
                title: sl.title,
                timeWindow: `${openT} - ${lockT}`,
                openTime: openT,
                lockTime: lockT,
                points: Number(sl.base_points) || 1
              });
            }
          });
        }

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

        if (Array.isArray(slotsList) && slotsList.length > 0) {
          const rows = slotsList.map((s, idx) => {
            const openT = (s.openTime && s.openTime.length === 5) ? s.openTime : '09:00';
            const lockT = (s.lockTime && s.lockTime.length === 5) ? s.lockTime : '10:15';
            return {
              slot_date: dateStr,
              title: s.title || `סדר ${idx + 1}`,
              time_window: `${openT} - ${lockT}`,
              open_time: `${dateStr}T${openT}:00+02:00`,
              lock_time: `${dateStr}T${lockT}:00+02:00`,
              base_points: Number(s.points) || 1,
              full_seder_achieved: false
            };
          });

          await client.from('schedule_slots').insert(rows);
        }

        // סנכרון כמות סדרים וניקוד יומי ב-campaign_calendar
        const totalPts = (slotsList || []).reduce((sum, x) => sum + (Number(x.points) || 1), 0);
        await client.from('campaign_calendar').update({
          sedarim_count: (slotsList || []).length,
          points_pool: totalPts
        }).eq('iso_date', dateStr);

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

    // ==========================================
    // 3. הגדרות מבצע, יעדי ניקוד ועצירות מסע (campaign_config)
    // ==========================================
    async getConfig() {
      if (!client) return null;
      try {
        const { data: cfgRow } = await client.from('campaign_config').select('*').eq('id', 1).maybeSingle();
        const base = cfgRow || {};
        const targetsRaw = base.targets_json || {};
        const extraTargets = targetsRaw.extra || [];
        const trailStops = base.journey_stops || [
          { id: 'stop_1', title: 'עצירה 1 – פיתחו יומנים!', isoDate: '2026-11-19', dateLabel: 'יום ה׳ ט׳ כסליו', description: 'חשיפת סדרי המשך ופרסי ביניים', isDecided: true },
          { id: 'stop_2', title: 'עצירה 2 – חלוקת שי חנוכה ומלגות', isoDate: '2026-12-08', dateLabel: 'נר חמישי של חנוכה', description: 'הדלקת נרות מרכזית וחלוקת מלגות', isDecided: true },
          { id: 'stop_3', title: 'הפסגה – מעמד הסיום הגדול!', isoDate: '2027-02-08', dateLabel: 'ר״ח אדר א׳', description: 'הכרזת הזוכים במסע ובפרס הענק', isDecided: false }
        ];

        return {
          campaignName: base.campaign_name || 'מבצע חורף תשפ״ז - עד הפסגה',
          startDate: base.start_date || '2026-10-25',
          endDate: base.end_date || '2027-02-08',
          minTarget: base.min_target_score || 100,
          adminPassword: base.admin_password || '2032',
          qrSecret: (base.qr_secret || 'BK-892').trim().toUpperCase(),
          targets: {
            min: targetsRaw.min || { name: 'יעד 1 – כניסה להגרלה', points: 70, reward: 'כניסה להגרלה הגדולה' },
            mid: targetsRaw.mid || { name: 'יעד 2 – פרס כספי', points: 100, reward: 'מלגת 300 ₪ במזומן' },
            max: targetsRaw.max || { name: 'הפסגה – נסיעה ופרס ענק', points: 130, reward: 'מסע הפסגה ונסיעה VIP' }
          },
          extraTargets: extraTargets,
          trailStops: trailStops,
          bonusConfig: base.bonus_config || {
            noPhoneBonus: 1,
            wakeupBonus: 3,
            kitchenBonus: 3
          },
          fullSederThreshold: Number(base.full_seder_threshold) || 10,
          fullSederBonusPts: Number(base.full_seder_bonus_pts) || 1,
          recurringDuties: base.duties_roster || {}
        };
      } catch (e) {
        console.error('Db.getConfig error:', e);
        return null;
      }
    },

    async saveConfig(cfg) {
      if (!client || !cfg) return false;
      try {
        const targetsData = {
          min: cfg.targets?.min || { name: 'יעד 1 – כניסה להגרלה', points: 70, reward: 'כניסה להגרלה הגדולה' },
          mid: cfg.targets?.mid || { name: 'יעד 2 – פרס כספי', points: 100, reward: 'מלגת 300 ₪ במזומן' },
          max: cfg.targets?.max || { name: 'הפסגה – נסיעה ופרס ענק', points: 130, reward: 'מסע הפסגה ונסיעה VIP' },
          extra: cfg.extraTargets || []
        };

        const payload = {
          id: 1,
          campaign_name: cfg.campaignName || 'מבצע חורף תשפ״ז - עד הפסגה',
          start_date: cfg.startDate || '2026-10-25',
          end_date: cfg.endDate || '2027-02-08',
          min_target_score: targetsData.mid?.points || 100,
          admin_password: String(cfg.adminPassword || '2032').trim(),
          qr_secret: String(cfg.qrSecret || 'BK-892').trim().toUpperCase(),
          targets_json: targetsData,
          journey_stops: cfg.trailStops || [],
          bonus_config: cfg.bonusConfig || null,
          full_seder_threshold: Number(cfg.fullSederThreshold) || 10,
          full_seder_bonus_pts: Number(cfg.fullSederBonusPts) || 1,
          duties_roster: cfg.recurringDuties || null
        };

        const { error } = await client.from('campaign_config').upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error('Db.saveConfig Supabase error:', error);
        }
        return !error;
      } catch (e) {
        console.error('Db.saveConfig error:', e);
        return false;
      }
    },

    // ==========================================
    // 4. תורנויות מעורר ומטבח (campaign_calendar)
    // ==========================================
    async getCalendarDuties() {
      if (!client) return {};
      try {
        const { data, error } = await client.from('campaign_calendar').select('*').order('iso_date', { ascending: true });
        const map = {};
        if (!error && Array.isArray(data)) {
          data.forEach(r => {
            map[r.iso_date] = {
              isoDate: r.iso_date,
              dayName: r.day_name || r.day_name_he || '',
              hebrewDate: r.hebrew_date || '',
              wakeupStudentId: r.wakeup_student_id,
              kitchenStudentId: r.kitchen_student_id,
              wakeupDone: !!r.wakeup_done,
              kitchenDone: !!r.kitchen_done,
              specialEventTitle: r.special_event_title || '',
              stationTitle: r.station_title || ''
            };
          });
        }

        // שילוב תורנויות קבועות מ-campaign_config אם תאריך מסוים ריק
        const { data: cfgRow } = await client.from('campaign_config').select('duties_roster').eq('id', 1).maybeSingle();
        const recurring = cfgRow?.duties_roster || {};
        Object.keys(map).forEach(iso => {
          const dObj = new Date(iso);
          const dayIdx = dObj.getDay(); // 0 is Sunday
          if (recurring[dayIdx]) {
            if (!map[iso].wakeupStudentId && recurring[dayIdx].wakeupStudentId) {
              map[iso].wakeupStudentId = recurring[dayIdx].wakeupStudentId;
            }
            if (!map[iso].kitchenStudentId && recurring[dayIdx].kitchenStudentId) {
              map[iso].kitchenStudentId = recurring[dayIdx].kitchenStudentId;
            }
          }
        });

        return map;
      } catch (e) {
        return {};
      }
    },

    async saveDuty(isoDate, wakeupId, kitchenId, wakeupDone, kitchenDone) {
      if (!client || !isoDate) return false;
      try {
        const dObj = new Date(isoDate);
        const dayIdx = dObj.getDay();
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

        const row = {
          iso_date: isoDate,
          greg_label: isoDate.slice(5),
          greg_full: isoDate,
          day_of_week: dayIdx,
          day_name_he: dayNames[dayIdx],
          day_name: `יום ${dayNames[dayIdx]}`,
          hebrew_date: '',
          wakeup_student_id: wakeupId || null,
          kitchen_student_id: kitchenId || null,
          wakeup_done: !!wakeupDone,
          kitchen_done: !!kitchenDone,
          updated_at: new Date().toISOString()
        };

        const { error } = await client.from('campaign_calendar').upsert(row, { onConflict: 'iso_date' });
        return !error;
      } catch (e) {
        console.error('Db.saveDuty error:', e);
        return false;
      }
    },

    async deleteDutyDate(isoDate) {
      if (!client || !isoDate) return false;
      try {
        await client.from('campaign_calendar').delete().eq('iso_date', isoDate);
        return true;
      } catch (e) {
        return false;
      }
    },

    async saveCalendarEvent(isoDate, specialEventTitle, stationTitle) {
      if (!client || !isoDate) return false;
      try {
        const updateData = { updated_at: new Date().toISOString() };
        if (specialEventTitle !== undefined) updateData.special_event_title = specialEventTitle;
        if (stationTitle !== undefined) updateData.station_title = stationTitle;
        const { error } = await client.from('campaign_calendar').update(updateData).eq('iso_date', isoDate);
        return !error;
      } catch (e) {
        console.error('Db.saveCalendarEvent error:', e);
        return false;
      }
    },

    async saveRecurringDuties(recurringMap) {
      if (!client) return false;
      try {
        const { error } = await client.from('campaign_config').update({
          duties_roster: recurringMap
        }).eq('id', 1);
        return !error;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 5. רישומי נוכחות (טבלת attendance_logs)
    // ==========================================
    async recordAttendance(studentId, studentName, slotTitle, points, isPresent, noPhone, dateStr) {
      if (!client) return false;
      try {
        const cleanDate = dateStr || new Date().toISOString().slice(0, 10);
        
        // staus MUST BE 'approved' to satisfy attendance_logs_status_check
        await client.from('attendance_logs').insert([{
          user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
          student_name: studentName || '',
          slot_title: slotTitle || '',
          slot_date: cleanDate,
          points_earned: isPresent ? points : 0,
          no_phone: !!noPhone,
          status: 'approved',
          marked_at: new Date().toISOString()
        }]);

        // עדכון ניקוד הבחור
        const delta = isPresent ? points : -points;
        if (studentId) {
          await this.updateStudentScore(studentId, delta, isPresent);
        }

        return true;
      } catch (e) {
        console.error('Db.recordAttendance error:', e);
        return false;
      }
    },

    async getSlotAttendanceMap() {
      if (!client) return { byDateSlot: {}, phoneFree: {} };
      try {
        const byDateSlot = {};
        const phoneFree = {};

        const { data: logs } = await client.from('attendance_logs').select('*');
        if (Array.isArray(logs)) {
          logs.forEach(l => {
            if (!l.slot_date || !l.user_id) return;
            const d = l.slot_date;
            if (!byDateSlot[d]) byDateSlot[d] = {};
            const key = l.slot_title || l.slot_id || 'general';
            if (!byDateSlot[d][key]) byDateSlot[d][key] = [];
            const sid = String(l.user_id);

            if (l.status === 'approved' && !byDateSlot[d][key].includes(sid)) {
              byDateSlot[d][key].push(sid);
            }
            if (l.no_phone) {
              if (!phoneFree[d]) phoneFree[d] = {};
              if (!phoneFree[d][key]) phoneFree[d][key] = [];
              if (!phoneFree[d][key].includes(sid)) phoneFree[d][key].push(sid);
            }
          });
        }

        return { byDateSlot, phoneFree };
      } catch (e) {
        return { byDateSlot: {}, phoneFree: {} };
      }
    },

    async toggleSlotStudentAttendance(dateStr, slotTitle, studentId, isPresent, noPhone, points, studentName) {
      if (!client || !studentId) return false;
      try {
        const pts = Number(points) || 1;
        const total = pts + (noPhone ? 1 : 0);

        if (isPresent) {
          await this.recordAttendance(studentId, studentName, slotTitle, total, true, noPhone, dateStr);
        } else {
          // מחיקת רישום אם בוטל
          await client.from('attendance_logs').delete()
            .eq('user_id', studentId)
            .eq('slot_date', dateStr)
            .eq('slot_title', slotTitle);
          await this.updateStudentScore(studentId, -total);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 6. יומן בונוסים מיוחדים (manager_bonus_logs)
    // ==========================================
    async grantSpecialBonus(studentId, studentName, points, reason) {
      if (!client) return false;
      try {
        const pts = Number(points) || 1;
        await client.from('manager_bonus_logs').insert([{
          user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
          student_name: studentName || '',
          points: pts,
          reason: String(reason || 'בונוס מיוחד מראש הישיבה ⭐').trim(),
          created_at: new Date().toISOString()
        }]);

        if (studentId) {
          await this.updateStudentScore(studentId, pts);
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

    async deleteBonusLog(logId, studentId, points) {
      if (!client || !logId) return false;
      try {
        await client.from('manager_bonus_logs').delete().eq('id', logId);
        if (studentId && points) {
          await this.updateStudentScore(studentId, -Number(points));
        }
        return true;
      } catch (e) {
        return false;
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
        if (!error && Array.isArray(data)) return data;
        return [];
      } catch (e) {
        return [];
      }
    },

    async submitRequest(req) {
      if (!client || !req) return false;
      try {
        const { error } = await client.from('attendance_requests').insert([{
          student_id: (req.studentId && /^[0-9a-f-]{36}$/i.test(req.studentId)) ? req.studentId : null,
          student_name: req.studentName || '',
          slot_title: req.slotTitle || '',
          date_str: req.dateStr || new Date().toISOString().slice(0, 10),
          reason: req.reason || '',
          status: 'pending',
          created_at: new Date().toISOString()
        }]);
        return !error;
      } catch (e) {
        return false;
      }
    },

    async updateRequestStatus(reqId, newStatus, studentId, studentName, slotTitle, points) {
      if (!client || !reqId) return false;
      try {
        await client.from('attendance_requests').update({ status: newStatus }).eq('id', reqId);
        if (newStatus === 'approved' && studentId) {
          await this.recordAttendance(studentId, studentName, slotTitle, points || 1, true, false);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 8. תאימות לאחור
    // ==========================================
    async saveAppState() { return true; },
    async loadAppState() { return null; },

    // ==========================================
    // 9. סנכרון Realtime וסריקה אוטומטית (Heartbeat)
    // ==========================================
    subscribeRealtime(onUpdate) {
      if (typeof onUpdate !== 'function') return;

      // 1. הפעלת מנגנון Polling עדין כל 5 שניות לוודא סנכרון 100% בין מסכים
      setInterval(() => {
        onUpdate();
      }, 5000);

      // 2. ערוץ Realtime
      if (client && client.channel) {
        try {
          client.channel('bakshu_live_pulse')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, onUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots' }, onUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_calendar' }, onUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, onUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_requests' }, onUpdate)
            .subscribe();
        } catch (e) {}
      }
    },

    getGoogleCalendarUrl(opts) {
      if (typeof window !== 'undefined' && window.App && typeof window.App.getGoogleCalendarUrl === 'function') {
        return window.App.getGoogleCalendarUrl(opts);
      }
      return '';
    }
  };

  g.Db = Db;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Db;
  }
})();
