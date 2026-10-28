/**
 * db.js - שכבת נתונים מאוחדת וחסינה מול שרת Supabase החי
 * Single Source of Truth - תאימות מלאה לכל עמודות השרת, מניעת כפילויות וחישוב ניקוד אמת
 */

(function() {
  const g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  const SUPABASE_URL = 'https://apuuuubjrhejknyvzvpn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DuJUmTpWwU4h3P8r1htVWw_24i-VjeG';

  const client = (g.supabase && g.supabase.createClient)
    ? g.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  // חילוץ אחיד של מטא-דאטה מרשומת נוכחות (מבוסס על העמודות המובנות של attendance_logs בשרת)
  function parseAttendanceRow(row) {
    if (!row) return null;
    const dateStr = row.slot_date || (row.marked_at ? String(row.marked_at).slice(0, 10) : '');
    const slotTitle = String(row.slot_title || '').trim();
    const noPhone = !!row.no_phone;
    const points = Number(row.points_earned ?? (1 + (noPhone ? 1 : 0))) || 1;
    const basePoints = noPhone ? Math.max(1, points - 1) : points;

    return {
      id: row.id,
      userId: row.user_id ? String(row.user_id) : null,
      studentName: row.student_name || '',
      slotDate: dateStr,
      slotTitle: slotTitle,
      points: points,
      basePoints: basePoints,
      noPhone: noPhone,
      status: row.status || 'approved',
      markedAt: row.marked_at || new Date().toISOString()
    };
  }

  // תבנית סדרי ברירת מחדל ליום נתון (משמשת רק לאתחול ראשוני או ללחיצה מפורשת על "אפס לתבנית")
  function getDefaultSlotsForIsoDate(isoDate) {
    const dObj = new Date(isoDate + 'T12:00:00');
    const dow = dObj.getDay();
    if (dow === 5) return []; // יום שישי ללא סדרים כברירת מחדל
    if (dow === 6) {
      return [
        { id: `slot_${isoDate}_1`, title: 'סדר שחרית (קודם התפילה)', openTime: '08:00', lockTime: '10:00', points: 2, timeWindow: '08:00 - 10:00' },
        { id: `slot_${isoDate}_2`, title: 'סדר שבת אחה״צ', openTime: '16:00', lockTime: '19:00', points: 2, timeWindow: '16:00 - 19:00' }
      ];
    }
    return [
      { id: `slot_${isoDate}_1`, title: 'סדר א׳ (עיון)', openTime: '09:00', lockTime: '13:00', points: 1, timeWindow: '09:00 - 13:00' },
      { id: `slot_${isoDate}_2`, title: 'סדר ב׳ (בקיאות)', openTime: '16:00', lockTime: '19:00', points: 1, timeWindow: '16:00 - 19:00' },
      { id: `slot_${isoDate}_3`, title: 'סדר ג׳ (ערב)', openTime: '20:30', lockTime: '22:30', points: 1, timeWindow: '20:30 - 22:30' }
    ];
  }

  const Db = {
    client,
    url: SUPABASE_URL,
    key: SUPABASE_KEY,
    getDefaultSlotsForIsoDate,

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
          const fallback = await client.from('users').select('*').order('full_name', { ascending: true });
          return (fallback.data || []).filter(u => u.role !== 'admin' && u.is_active !== false);
        }
        return data || [];
      } catch (e) {
        console.error('Db.getStudents exception:', e);
        return [];
      }
    },

    async addStudent(fullName, phone) {
      if (!client || !fullName) return null;
      try {
        const cleanName = String(fullName).trim();
        const cleanPhone = String(phone || '').trim();
        const { data, error } = await client.from('users').insert([{
          full_name: cleanName,
          phone: cleanPhone,
          role: 'student',
          score: 0,
          manual_bonus_pts: 0,
          password: '1234',
          present_today: false,
          persistence_count: 0,
          is_active: true
        }]).select();

        if (error) {
          console.warn('Db.addStudent primary insert fallback:', error);
          const res2 = await client.from('users').insert([{
            full_name: cleanName,
            phone: cleanPhone,
            role: 'student',
            is_active: true
          }]).select();
          return res2.data ? res2.data[0] : null;
        }
        return data ? data[0] : null;
      } catch (e) {
        console.error('Db.addStudent exception:', e);
        return null;
      }
    },

    async addStudentsBatch(studentsArray) {
      if (!client || !Array.isArray(studentsArray) || studentsArray.length === 0) return 0;
      let addedCount = 0;
      for (const item of studentsArray) {
        if (item && item.fullName) {
          const res = await this.addStudent(item.fullName, item.phone || '');
          if (res) addedCount++;
        }
      }
      return addedCount;
    },

    async updateStudentDetails(studentId, fullName, phone) {
      if (!client || !studentId) return false;
      try {
        const payload = {};
        if (fullName !== undefined) payload.full_name = String(fullName).trim();
        if (phone !== undefined) payload.phone = String(phone).trim();
        const { error } = await client.from('users').update(payload).eq('id', studentId);
        return !error;
      } catch (e) {
        console.error('Db.updateStudentDetails error:', e);
        return false;
      }
    },

    async deleteStudent(studentId) {
      if (!client || !studentId) return false;
      try {
        // השבתה בטוחה או מחיקה מלאה
        const { error } = await client.from('users').update({ is_active: false }).eq('id', studentId);
        if (error) {
          await client.from('users').delete().eq('id', studentId);
        }
        return true;
      } catch (e) {
        console.error('Db.deleteStudent error:', e);
        return false;
      }
    },

    async updateStudentScore(studentId, deltaPoints, isPresent) {
      if (!client || !studentId) return false;
      try {
        const { data: st } = await client.from('users').select('score, manual_bonus_pts').eq('id', studentId).maybeSingle();
        const curScore = Number(st?.score ?? st?.manual_bonus_pts ?? 0);
        const newScore = Math.max(0, curScore + (Number(deltaPoints) || 0));

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
    // 2. לוח זמנים וסדרים (טבלת schedule_slots היא מקור האמת היחיד והבלעדי!)
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

            if (sl.title === '__EMPTY_DAY__') {
              return;
            }

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

    _formatTime(t, fallback = '09:00') {
      if (!t || typeof t !== 'string') return fallback;
      const clean = t.trim();
      const m = clean.match(/^(\d{1,2}):(\d{2})/);
      if (m) {
        return `${m[1].padStart(2, '0')}:${m[2]}`;
      }
      return fallback;
    },

    async syncDateSlots(dateStr, slotsList) {
      if (!client || !dateStr) return false;
      try {
        // 1. מחיקת כל הסדרים הישנים לתאריך זה בשרת
        const { error: delErr } = await client.from('schedule_slots').delete().eq('slot_date', dateStr);
        if (delErr) {
          console.error('Db.syncDateSlots delete error:', delErr);
        }

        // 2. אם הרשימה ריקה (נמחקו כל הסדרים ביום זה), לא מכניסים שום שורה - טבלת schedule_slots היא מקור האמת היחיד!
        if (!Array.isArray(slotsList) || slotsList.length === 0) {
          return true;
        }

        // 3. הכנסת הסדרים המעודכנים
        const rows = slotsList.map((s, idx) => {
          const openT = this._formatTime(s.openTime, '09:00');
          const lockT = this._formatTime(s.lockTime, '10:15');
          return {
            slot_date: dateStr,
            title: (s.title || `סדר ${idx + 1}`).trim(),
            time_window: `${openT} - ${lockT}`,
            open_time: `${dateStr}T${openT}:00+02:00`,
            lock_time: `${dateStr}T${lockT}:00+02:00`,
            base_points: Number(s.points) || 1,
            full_seder_achieved: false
          };
        });

        const { error: insErr } = await client.from('schedule_slots').insert(rows);
        if (insErr) {
          console.error('Db.syncDateSlots insert error:', insErr);
          return false;
        }

        return true;
      } catch (e) {
        console.error('Db.syncDateSlots error:', e);
        return false;
      }
    },

    async syncMultipleDateSlots(dateSlotsMap) {
      if (!client || !dateSlotsMap || typeof dateSlotsMap !== 'object') return false;
      const dates = Object.keys(dateSlotsMap);
      if (dates.length === 0) return true;

      try {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < dates.length; i += CHUNK_SIZE) {
          const chunkDates = dates.slice(i, i + CHUNK_SIZE);
          const { error: delErr } = await client.from('schedule_slots').delete().in('slot_date', chunkDates);
          if (delErr) {
            console.error('Db.syncMultipleDateSlots delete error:', delErr);
          }
        }

        const allRows = [];
        dates.forEach(d => {
          const list = dateSlotsMap[d];
          if (Array.isArray(list) && list.length > 0) {
            list.forEach((s, idx) => {
              const openT = this._formatTime(s.openTime, '09:00');
              const lockT = this._formatTime(s.lockTime, '10:15');
              allRows.push({
                slot_date: d,
                title: (s.title || `סדר ${idx + 1}`).trim(),
                time_window: `${openT} - ${lockT}`,
                open_time: `${d}T${openT}:00+02:00`,
                lock_time: `${d}T${lockT}:00+02:00`,
                base_points: Number(s.points) || 1,
                full_seder_achieved: false
              });
            });
          }
        });

        if (allRows.length > 0) {
          for (let i = 0; i < allRows.length; i += 100) {
            const chunkRows = allRows.slice(i, i + 100);
            const { error: insErr } = await client.from('schedule_slots').insert(chunkRows);
            if (insErr) {
              console.error('Db.syncMultipleDateSlots insert error:', insErr);
              return false;
            }
          }
        }

        return true;
      } catch (e) {
        console.error('Db.syncMultipleDateSlots error:', e);
        return false;
      }
    },

    async deleteSlotSeries(sederTitle) {
      if (!client || !sederTitle) return false;
      try {
        const clean = String(sederTitle).trim();
        const { error } = await client.from('schedule_slots').delete().eq('title', clean);
        if (error) {
          console.error('Db.deleteSlotSeries error:', error);
          return false;
        }
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

        const bonusCfg = base.bonus_config || {};

        return {
          campaignName: base.campaign_name || 'מבצע חורף תשפ״ז - עד הפסגה',
          startDate: base.start_date || '2026-10-25',
          endDate: base.end_date || '2027-02-08',
          minTarget: base.min_target_score || 100,
          adminPassword: base.admin_password || '1234',
          targets: {
            min: targetsRaw.min || { name: 'יעד 1', points: 100, reward: 'חכו ותגלו' },
            mid: targetsRaw.mid || { name: 'יעד 2', points: 200, reward: 'חכו ותגלו' },
            max: targetsRaw.max || { name: 'הפסגה', points: 350, reward: 'נקודת סיום על הקצה' }
          },
          extraTargets: extraTargets,
          trailStops: trailStops,
          bonusConfig: {
            noPhoneBonus: Number(bonusCfg.noPhoneBonus ?? 1),
            wakeupBonus: Number(bonusCfg.wakeupBonus ?? 3),
            kitchenBonus: Number(bonusCfg.kitchenBonus ?? 3)
          },
          fullSederThreshold: Number(base.full_seder_threshold) || 10,
          fullSederBonusPts: Number(base.full_seder_bonus_pts) || 2,
          xyRequiredCount: Number(base.xy_required_count ?? bonusCfg.xyRequiredCount ?? 8),
          xyWindowSize: Number(base.xy_window_size ?? bonusCfg.xyWindowSize ?? 10),
          xyBonusPts: Number(base.xy_bonus_pts ?? bonusCfg.xyBonusPts ?? 3),
          recurringDuties: base.duties_roster?.recurring || base.duties_roster || {},
          dutiesConfig: base.duties_roster?.dutiesConfig || {
            duty1Name: 'תורן מעורר (בוקר)',
            duty1Hour: '06:30',
            duty1ReminderHour: '21:30',
            duty2Name: 'תורן מטבח (צהריים/ערב)',
            duty2Hour: '12:00',
            duty2ReminderHour: '11:00'
          }
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
          min: cfg.targets?.min || { name: 'יעד 1', points: 100, reward: 'חכו ותגלו' },
          mid: cfg.targets?.mid || { name: 'יעד 2', points: 200, reward: 'חכו ותגלו' },
          max: cfg.targets?.max || { name: 'הפסגה', points: 350, reward: 'נקודת סיום על הקצה' },
          extra: cfg.extraTargets || []
        };

        const dutiesRosterData = {
          recurring: cfg.recurringDuties || {},
          dutiesConfig: cfg.dutiesConfig || {
            duty1Name: 'תורן מעורר (בוקר)',
            duty1Hour: '06:30',
            duty1ReminderHour: '21:30',
            duty2Name: 'תורן מטבח (צהריים/ערב)',
            duty2Hour: '12:00',
            duty2ReminderHour: '11:00'
          }
        };

        const bonusConfigData = {
          noPhoneBonus: Number(cfg.bonusConfig?.noPhoneBonus ?? 1),
          wakeupBonus: Number(cfg.bonusConfig?.wakeupBonus ?? 3),
          kitchenBonus: Number(cfg.bonusConfig?.kitchenBonus ?? 3),
          xyRequiredCount: Number(cfg.xyRequiredCount ?? 8),
          xyWindowSize: Number(cfg.xyWindowSize ?? 10),
          xyBonusPts: Number(cfg.xyBonusPts ?? 3)
        };

        const payload = {
          id: 1,
          campaign_name: cfg.campaignName || 'מבצע חורף תשפ״ז - עד הפסגה',
          start_date: cfg.startDate || '2026-10-25',
          end_date: cfg.endDate || '2027-02-08',
          min_target_score: targetsData.mid?.points || 100,
          admin_password: String(cfg.adminPassword || '1234').trim(),
          targets_json: targetsData,
          journey_stops: cfg.trailStops || [],
          bonus_config: bonusConfigData,
          full_seder_threshold: Number(cfg.fullSederThreshold) || 10,
          full_seder_bonus_pts: Number(cfg.fullSederBonusPts) || 2,
          xy_required_count: Number(cfg.xyRequiredCount) || 8,
          xy_window_size: Number(cfg.xyWindowSize) || 10,
          xy_bonus_pts: Number(cfg.xyBonusPts) || 3,
          duties_roster: dutiesRosterData
        };

        const { error } = await client.from('campaign_config').upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error('Db.saveConfig Supabase error:', error);
          return false;
        }
        return true;
      } catch (e) {
        console.error('Db.saveConfig error:', e);
        return false;
      }
    },

    // ==========================================
    // 4. תורנויות מעורר ומטבח (campaign_calendar)
    // ==========================================
    _getHebrewDateStr(isoDate) {
      try {
        if (g.App && Array.isArray(g.App.CAMPAIGN_DAYS)) {
          const found = g.App.CAMPAIGN_DAYS.find(d => d.isoDate === isoDate);
          if (found && found.hebrewDate) return found.hebrewDate;
        }
        const dObj = new Date(isoDate + 'T12:00:00');
        return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(dObj) || isoDate;
      } catch (e) {
        return isoDate;
      }
    },

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
        const recurring = cfgRow?.duties_roster?.recurring || cfgRow?.duties_roster || {};
        Object.keys(map).forEach(iso => {
          const dObj = new Date(iso + 'T12:00:00');
          const dayIdx = dObj.getDay();
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
        console.error('Db.getCalendarDuties error:', e);
        return {};
      }
    },

    async saveDuty(isoDate, wakeupId, kitchenId, wakeupDone, kitchenDone, specialEventTitle) {
      if (!client || !isoDate) return false;
      try {
        const dObj = new Date(isoDate + 'T12:00:00');
        const dayIdx = dObj.getDay();
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

        const row = {
          iso_date: isoDate,
          greg_label: isoDate.slice(5),
          greg_full: isoDate,
          day_of_week: dayIdx,
          day_name_he: dayNames[dayIdx],
          day_name: `יום ${dayNames[dayIdx]}`,
          hebrew_date: this._getHebrewDateStr(isoDate),
          wakeup_student_id: wakeupId || null,
          kitchen_student_id: kitchenId || null,
          wakeup_done: !!wakeupDone,
          kitchen_done: !!kitchenDone,
          updated_at: new Date().toISOString()
        };
        if (specialEventTitle !== undefined) {
          row.special_event_title = specialEventTitle;
        }

        const { error } = await client.from('campaign_calendar').upsert(row, { onConflict: 'iso_date' });
        return !error;
      } catch (e) {
        console.error('Db.saveDuty error:', e);
        return false;
      }
    },

    async updateDutyField(isoDate, fieldName, value) {
      if (!client || !isoDate || !fieldName) return false;
      try {
        const dObj = new Date(isoDate + 'T12:00:00');
        const dayIdx = dObj.getDay();
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

        const { data: existing } = await client.from('campaign_calendar').select('*').eq('iso_date', isoDate).maybeSingle();
        const row = {
          iso_date: isoDate,
          greg_label: existing?.greg_label || isoDate.slice(5),
          greg_full: existing?.greg_full || isoDate,
          day_of_week: existing?.day_of_week ?? dayIdx,
          day_name_he: existing?.day_name_he || dayNames[dayIdx],
          day_name: existing?.day_name || `יום ${dayNames[dayIdx]}`,
          hebrew_date: existing?.hebrew_date || this._getHebrewDateStr(isoDate),
          wakeup_student_id: existing?.wakeup_student_id || null,
          kitchen_student_id: existing?.kitchen_student_id || null,
          wakeup_done: !!existing?.wakeup_done,
          kitchen_done: !!existing?.kitchen_done,
          special_event_title: existing?.special_event_title || '',
          [fieldName]: value,
          updated_at: new Date().toISOString()
        };

        const { error } = await client.from('campaign_calendar').upsert(row, { onConflict: 'iso_date' });
        return !error;
      } catch (e) {
        console.error('Db.updateDutyField error:', e);
        return false;
      }
    },

    async toggleDutyDone(isoDate, doneField, isDone) {
      return await this.updateDutyField(isoDate, doneField, !!isDone);
    },

    async saveBulkDuties(dutiesRowsArray) {
      if (!client || !Array.isArray(dutiesRowsArray) || dutiesRowsArray.length === 0) return true;
      try {
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const rows = dutiesRowsArray.map(item => {
          const dObj = new Date(item.isoDate + 'T12:00:00');
          const dayIdx = dObj.getDay();
          return {
            iso_date: item.isoDate,
            greg_label: item.isoDate.slice(5),
            greg_full: item.isoDate,
            day_of_week: dayIdx,
            day_name_he: dayNames[dayIdx],
            day_name: `יום ${dayNames[dayIdx]}`,
            hebrew_date: item.hebrewDate || this._getHebrewDateStr(item.isoDate),
            wakeup_student_id: item.wakeupStudentId || null,
            kitchen_student_id: item.kitchenStudentId || null,
            wakeup_done: !!item.wakeupDone,
            kitchen_done: !!item.kitchenDone,
            updated_at: new Date().toISOString()
          };
        });

        const { error } = await client.from('campaign_calendar').upsert(rows, { onConflict: 'iso_date' });
        return !error;
      } catch (e) {
        console.error('Db.saveBulkDuties error:', e);
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
        return await this.updateDutyField(isoDate, 'special_event_title', specialEventTitle || '');
      } catch (e) {
        console.error('Db.saveCalendarEvent error:', e);
        return false;
      }
    },

    async saveRecurringDuties(recurringMap) {
      if (!client) return false;
      try {
        const { data: cfgRow } = await client.from('campaign_config').select('duties_roster').eq('id', 1).maybeSingle();
        const existingRoster = cfgRow?.duties_roster || {};
        const updatedRoster = {
          ...existingRoster,
          recurring: recurringMap
        };
        const { error } = await client.from('campaign_config').update({
          duties_roster: updatedRoster
        }).eq('id', 1);
        return !error;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 5. רישומי נוכחות (טבלת attendance_logs) - חסין 100% לכל סכמה!
    // ==========================================
    async getAllParsedAttendanceLogs() {
      if (!client) return [];
      try {
        const { data, error } = await client.from('attendance_logs').select('*').order('marked_at', { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data
          .map(parseAttendanceRow)
          .filter(r => r && r.userId && r.slotDate && r.status === 'approved');
      } catch (e) {
        console.error('Db.getAllParsedAttendanceLogs error:', e);
        return [];
      }
    },

    async hasStudentCheckedIn(studentId, slotTitle, dateStr) {
      if (!client || !studentId) return false;
      try {
        const cleanDate = dateStr || new Date().toISOString().slice(0, 10);
        const cleanTitle = (slotTitle || '').trim();
        const { data } = await client
          .from('attendance_logs')
          .select('*')
          .eq('user_id', studentId)
          .eq('slot_title', cleanTitle)
          .eq('status', 'approved');

        if (!Array.isArray(data) || data.length === 0) return false;
        return data.map(parseAttendanceRow).some(r => r && r.slotDate === cleanDate);
      } catch (e) {
        return false;
      }
    },

    async recordAttendance(studentId, studentName, slotTitle, points, isPresent, noPhone, dateStr) {
      if (!client || !studentId) return false;
      try {
        const cleanDate = dateStr || new Date().toISOString().slice(0, 10);
        const cleanTitle = String(slotTitle || '').trim();
        const isValidUuid = /^[0-9a-f-]{36}$/i.test(String(studentId));
        if (!isValidUuid) return false;

        // 1. בדיקת רשומות קיימות של הבחור עבור אותו סדר
        const { data: existingRows } = await client
          .from('attendance_logs')
          .select('*')
          .eq('user_id', studentId)
          .eq('slot_title', cleanTitle);

        const matchingTodayRows = (existingRows || []).filter(row => {
          const parsed = parseAttendanceRow(row);
          return parsed && parsed.slotDate === cleanDate;
        });

        // אם המטרה היא ביטול נוכחות (isPresent === false)
        if (!isPresent) {
          if (matchingTodayRows.length > 0) {
            const idsToDel = matchingTodayRows.map(r => r.id);
            await client.from('attendance_logs').delete().in('id', idsToDel);
            await this.recalculateStudentScore(studentId);
          }
          return true;
        }

        // אם כבר קיימת רשומה לאותו תאריך וסדר:
        const totalPoints = Number(points) || (1 + (noPhone ? 1 : 0));

        if (matchingTodayRows.length > 0) {
          // בדיקה אם השינוי הוא רק במתג "ללא טלפון" או ניסיון סימון כפול
          const prevParsed = parseAttendanceRow(matchingTodayRows[0]);
          if (prevParsed.noPhone === !!noPhone && prevParsed.points === totalPoints) {
            return 'ALREADY_CHECKED_IN';
          }
          // עדכון הרשומה הקיימת בעמודות המובנות של הטבלה
          const targetId = matchingTodayRows[0].id;
          const { error: updErr } = await client.from('attendance_logs').update({
            points_earned: totalPoints,
            no_phone: !!noPhone,
            slot_date: cleanDate,
            status: 'approved'
          }).eq('id', targetId);

          if (updErr) {
            console.error('Db.recordAttendance update error:', updErr);
            return false;
          }
          await this.recalculateStudentScore(studentId);
          return true;
        }

        // 2. הכנסת רשומה חדשה ישירות לעמודות המובנות של טבלת attendance_logs בשרת
        const markedAtIso = new Date().toISOString();
        const payload = {
          user_id: studentId,
          student_name: studentName || '',
          slot_title: cleanTitle,
          slot_date: cleanDate,
          points_earned: totalPoints,
          no_phone: !!noPhone,
          status: 'approved',
          marked_at: markedAtIso
        };

        const { error: insErr } = await client.from('attendance_logs').insert([payload]);
        if (insErr) {
          console.error('Db.recordAttendance insert error:', insErr);
          return false;
        }

        // 3. חישוב מחדש של ניקוד האמת של הבחור
        await this.recalculateStudentScore(studentId);
        return true;
      } catch (e) {
        console.error('Db.recordAttendance exception:', e);
        return false;
      }
    },

    async getSlotAttendanceMap() {
      if (!client) return { byDateSlot: {}, phoneFree: {} };
      try {
        const byDateSlot = {};
        const phoneFree = {};

        const parsedLogs = await this.getAllParsedAttendanceLogs();
        parsedLogs.forEach(l => {
          const d = l.slotDate;
          const key = l.slotTitle || 'general';
          const sid = l.userId;
          if (!d || !sid) return;

          if (!byDateSlot[d]) byDateSlot[d] = {};
          if (!byDateSlot[d][key]) byDateSlot[d][key] = [];
          if (!byDateSlot[d][key].includes(sid)) {
            byDateSlot[d][key].push(sid);
          }

          if (l.noPhone) {
            if (!phoneFree[d]) phoneFree[d] = {};
            if (!phoneFree[d][key]) phoneFree[d][key] = [];
            if (!phoneFree[d][key].includes(sid)) {
              phoneFree[d][key].push(sid);
            }
          }
        });

        return { byDateSlot, phoneFree };
      } catch (e) {
        console.error('Db.getSlotAttendanceMap error:', e);
        return { byDateSlot: {}, phoneFree: {} };
      }
    },

    async toggleSlotStudentAttendance(dateStr, slotTitle, studentId, isPresent, noPhone, basePoints, studentName) {
      if (!client || !studentId) return false;
      try {
        const cleanDate = dateStr || new Date().toISOString().slice(0, 10);
        const cleanTitle = String(slotTitle || '').trim();
        const bPts = Number(basePoints) || 1;
        const totalPts = bPts + (noPhone ? 1 : 0);

        if (isPresent) {
          const res = await this.recordAttendance(studentId, studentName, cleanTitle, totalPts, true, !!noPhone, cleanDate);
          return !!res;
        } else {
          // מחיקת רישום של אותו תאריך וסדר
          const { data: existingRows } = await client
            .from('attendance_logs')
            .select('*')
            .eq('user_id', studentId)
            .eq('slot_title', cleanTitle);

          const matchingIds = (existingRows || [])
            .filter(r => {
              const p = parseAttendanceRow(r);
              return p && p.slotDate === cleanDate;
            })
            .map(r => r.id);

          if (matchingIds.length > 0) {
            await client.from('attendance_logs').delete().in('id', matchingIds);
          }
          await this.recalculateStudentScore(studentId);
          return true;
        }
      } catch (e) {
        console.error('Db.toggleSlotStudentAttendance error:', e);
        return false;
      }
    },

    // ==========================================
    // מנוע חישוב ניקוד אמת ומד התמדה (Ledger Recalculation)
    // ==========================================
    async recalculateStudentScore(studentId) {
      if (!client || !studentId) return 0;
      try {
        const sid = String(studentId);
        const todayIso = (g.App && g.App.getTodayIsraelDate) ? g.App.getTodayIsraelDate() : new Date().toISOString().slice(0, 10);

        const [cfg, allLogs, calRes, bonusRes] = await Promise.all([
          this.getConfig(),
          this.getAllParsedAttendanceLogs(),
          client.from('campaign_calendar').select('*'),
          client.from('manager_bonus_logs').select('*').eq('user_id', sid).gt('points', 0)
        ]);

        // 1. סינון רשומות הנוכחות הייחודיות של התלמיד (לפי תאריך + שם סדר)
        const myLogsMap = {};
        const attendanceCountByDateSlot = {};

        allLogs.forEach(l => {
          const key = `${l.slotDate}__${l.slotTitle}`;
          if (!attendanceCountByDateSlot[key]) attendanceCountByDateSlot[key] = new Set();
          attendanceCountByDateSlot[key].add(l.userId);

          if (l.userId === sid) {
            myLogsMap[key] = l;
          }
        });

        const myUniqueLogs = Object.values(myLogsMap);
        let attendancePoints = 0;
        let fullSederBonusPoints = 0;
        const fullThreshold = Number(cfg?.fullSederThreshold) || 10;
        const fullBonusPerSeder = Number(cfg?.fullSederBonusPts) || 2;

        myUniqueLogs.forEach(l => {
          attendancePoints += (Number(l.points) || 1);
          const key = `${l.slotDate}__${l.slotTitle}`;
          const attendeesCount = attendanceCountByDateSlot[key] ? attendanceCountByDateSlot[key].size : 0;
          if (attendeesCount >= fullThreshold) {
            fullSederBonusPoints += fullBonusPerSeder;
          }
        });

        // 2. נקודות תורנויות שבוצעו
        const wBonus = Number(cfg?.bonusConfig?.wakeupBonus ?? 3);
        const kBonus = Number(cfg?.bonusConfig?.kitchenBonus ?? 3);
        let dutyPoints = 0;
        (calRes.data || []).forEach(r => {
          if (String(r.wakeup_student_id) === sid && r.wakeup_done) {
            dutyPoints += wBonus;
          }
          if (String(r.kitchen_student_id) === sid && r.kitchen_done) {
            dutyPoints += kBonus;
          }
        });

        // 3. בונוסים מיוחדים מראש הישיבה
        let managerBonusPoints = 0;
        (bonusRes.data || []).forEach(b => {
          managerBonusPoints += (Number(b.points) || 0);
        });

        // 4. חישוב התמדה (כמה מתוך 10 הסדרים האחרונים) ובונוס התמדה
        const xyReq = Number(cfg?.xyRequiredCount) || 8;
        const xyWin = Number(cfg?.xyWindowSize) || 10;
        const xyPts = Number(cfg?.xyBonusPts) || 3;
        const totalAttendedSedarim = myUniqueLogs.length;
        const persistenceStreak = Math.min(xyWin, totalAttendedSedarim % (xyWin + 1));
        const completedWindows = Math.floor(totalAttendedSedarim / xyReq);
        const persistenceBonusPoints = completedWindows * xyPts;

        const finalScore = Math.max(0, attendancePoints + fullSederBonusPoints + dutyPoints + managerBonusPoints + persistenceBonusPoints);
        const isPresentToday = myUniqueLogs.some(l => l.slotDate === todayIso);

        await client.from('users').update({
          score: finalScore,
          manual_bonus_pts: finalScore,
          present_today: isPresentToday,
          persistence_count: Math.min(10, totalAttendedSedarim)
        }).eq('id', sid);

        return finalScore;
      } catch (e) {
        console.error('Db.recalculateStudentScore error:', e);
        return 0;
      }
    },

    // ==========================================
    // 6. יומן בונוסים מיוחדים (manager_bonus_logs)
    // ==========================================
    async grantSpecialBonus(studentId, studentName, points, reason) {
      if (!client || !studentId) return false;
      try {
        const pts = Number(points) || 1;
        const { error } = await client.from('manager_bonus_logs').insert([{
          user_id: (/^[0-9a-f-]{36}$/i.test(String(studentId))) ? studentId : null,
          student_name: studentName || '',
          points: pts,
          reason: String(reason || 'בונוס מיוחד מראש הישיבה ⭐').trim(),
          created_at: new Date().toISOString()
        }]);

        if (error) {
          console.error('Db.grantSpecialBonus insert error:', error);
          return false;
        }

        await this.recalculateStudentScore(studentId);
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
          .limit(100);
        return data || [];
      } catch (e) {
        return [];
      }
    },

    async deleteBonusLog(logId, studentId) {
      if (!client || !logId) return false;
      try {
        await client.from('manager_bonus_logs').delete().eq('id', logId);
        if (studentId) {
          await this.recalculateStudentScore(studentId);
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
          student_id: (req.studentId && /^[0-9a-f-]{36}$/i.test(String(req.studentId))) ? req.studentId : null,
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

    async updateRequestStatus(reqId, newStatus, studentId, studentName, slotTitle, points, dateStr) {
      if (!client || !reqId) return false;
      try {
        await client.from('attendance_requests').update({ status: newStatus }).eq('id', reqId);
        if (newStatus === 'approved' && studentId) {
          await this.recordAttendance(studentId, studentName, slotTitle, Number(points) || 1, true, false, dateStr);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // ==========================================
    // 8. סנכרון Realtime וסריקה אוטומטית (Heartbeat)
    // ==========================================
    subscribeRealtime(onUpdate) {
      if (typeof onUpdate !== 'function') return;

      let debounceTimer = null;
      const triggerUpdate = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          onUpdate();
        }, 700);
      };

      // 1. הפעלת מנגנון Polling כל 25 שניות כגיבוי רציף
      setInterval(() => {
        onUpdate();
      }, 25000);

      // 2. ערוץ Realtime לכל טבלאות המערכת
      if (client && client.channel) {
        try {
          client.channel('bakshu_live_pulse')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_calendar' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_config' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_requests' }, triggerUpdate)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_bonus_logs' }, triggerUpdate)
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
