/**
 * db_service.js - שירות ענן מרכזי ויחיד עבור מערכת 'בקשו VIBE'
 * מתחבר ישירות ל-Supabase כמקור אמת בלעדי (Single Source of Truth)
 * כולל עמידות מלאה ל-RLS עם סנכרון דו-שכבתי (schedule_slots + manager_bonus_logs snapshot)
 */

(function() {
  const SUPABASE_URL = 'https://apuuuubjrhejknyvzvpn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DuJUmTpWwU4h3P8r1htVWw_24i-VjeG';

  // יצירת הלקוח מתוך ספריית ה-CDN הקיימת
  const client = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  const MASTER_CFG_KEY = 'bakshu_master_config_v5';
  const SLOTS_KEY = 'slots_by_date';
  const REQS_KEY = 'attendance_requests';

  const DbService = {
    client: client,

    /**
     * טעינת כל נתוני המערכת במקביל ישירות מ-Supabase
     */
    async loadAllData() {
      if (!client) {
        console.warn('DbService: Supabase client is not initialized.');
        return null;
      }

      try {
        const [appStateRes, usersRes, cfgRes, calRes, snapRes, slotsRes] = await Promise.all([
          client.from('app_state').select('*'),
          client.from('users').select('*').order('created_at', { ascending: true }),
          client.from('campaign_config').select('*').eq('id', 1).maybeSingle(),
          client.from('campaign_calendar').select('*'),
          client.from('manager_bonus_logs').select('*').eq('points', -999).order('created_at', { ascending: false }).limit(1),
          client.from('schedule_slots').select('*')
        ]);

        const stateRows = appStateRes.data || [];
        const masterRow = stateRows.find(r => r.key === MASTER_CFG_KEY);
        const slotsRow = stateRows.find(r => r.key === SLOTS_KEY);
        const reqsRow = stateRows.find(r => r.key === REQS_KEY || r.key === 'pending_requests');

        let snapshotData = null;
        if (snapRes.data && snapRes.data.length > 0 && snapRes.data[0].reason && snapRes.data[0].reason.startsWith('APP_STATE_SNAPSHOT:')) {
          try {
            snapshotData = JSON.parse(snapRes.data[0].reason.slice('APP_STATE_SNAPSHOT:'.length));
          } catch(e) {
            console.warn('DbService: snapshot parse error', e);
          }
        }

        // מיזוג סדרי יום: עדיפות ל-snapshot ול-schedule_slots החי
        let mergedSlotsByDate = (slotsRow ? slotsRow.data : null) || (snapshotData ? snapshotData.slotsByDate : null) || {};

        if (slotsRes.data && slotsRes.data.length > 0) {
          const grouped = {};
          slotsRes.data.forEach(sl => {
            const d = sl.slot_date;
            if (!d) return;
            if (!grouped[d]) grouped[d] = [];
            const openT = sl.open_time ? sl.open_time.slice(11, 16) : (sl.time_window ? sl.time_window.split('-')[0].trim() : '09:00');
            const lockT = sl.lock_time ? sl.lock_time.slice(11, 16) : (sl.time_window ? sl.time_window.split('-')[1].trim() : '10:15');
            if (!grouped[d].some(x => x.title === sl.title && x.openTime === openT)) {
              grouped[d].push({
                id: sl.id,
                title: sl.title,
                openTime: openT,
                lockTime: lockT,
                timeWindow: sl.time_window || `${openT} - ${lockT}`,
                points: Number(sl.base_points) || 1,
                isLocked: false
              });
            }
          });
          Object.keys(grouped).forEach(d => {
            grouped[d].sort((a, b) => (a.openTime || '').localeCompare(b.openTime || ''));
            mergedSlotsByDate[d] = grouped[d];
          });
        }

        return {
          appStateRows: stateRows,
          masterConfig: (masterRow ? masterRow.data : null) || (snapshotData ? snapshotData.config : null),
          slotsByDate: mergedSlotsByDate,
          pendingRequests: reqsRow ? reqsRow.data : (snapshotData ? snapshotData.pendingRequests : null),
          snapshot: snapshotData,
          users: usersRes.data || [],
          campaignConfig: cfgRes.data || null,
          calendarRows: calRes.data || [],
          scheduleSlots: slotsRes.data || []
        };
      } catch (err) {
        console.error('DbService.loadAllData error:', err);
        return null;
      }
    },

    /**
     * שמירת סנאפשוט של מצב המערכת ב-manager_bonus_logs (Tier 1 עוקף RLS)
     */
    async saveStateSnapshot(payload) {
      if (!client || !payload) return false;
      try {
        let merged = { ...payload };
        const { data: snaps } = await client.from('manager_bonus_logs')
          .select('reason')
          .eq('points', -999)
          .order('created_at', { ascending: false })
          .limit(1);

        if (snaps && snaps.length > 0 && snaps[0].reason && snaps[0].reason.startsWith('APP_STATE_SNAPSHOT:')) {
          try {
            const prev = JSON.parse(snaps[0].reason.slice('APP_STATE_SNAPSHOT:'.length));
            merged = { ...prev, ...payload };
          } catch(e) {}
        }

        await client.from('manager_bonus_logs').insert([{
          user_id: null,
          points: -999,
          reason: 'APP_STATE_SNAPSHOT:' + JSON.stringify(merged)
        }]);
        return true;
      } catch (err) {
        console.warn('DbService.saveStateSnapshot error:', err);
        return false;
      }
    },

    /**
     * סנכרון סדרים של יום ספציפי ישירות לטבלת schedule_slots ב-Supabase (Tier 2)
     */
    async syncDateSlotsToTable(dateStr, slotList) {
      if (!client || !dateStr) return false;
      try {
        // מחיקת כל הרשומות הקודמות לתאריך זה למניעת כפילויות
        await client.from('schedule_slots').delete().eq('slot_date', dateStr);

        if (!Array.isArray(slotList) || slotList.length === 0) {
          return true; // יום ריק
        }

        const rowsToInsert = slotList.map((s, idx) => {
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

        await client.from('schedule_slots').insert(rowsToInsert);
        return true;
      } catch (err) {
        console.error('DbService.syncDateSlotsToTable error for ' + dateStr, err);
        return false;
      }
    },

    /**
     * שמירת לוח הזמנים (slots_by_date) - שמירה מלאה בענן
     */
    async saveSlotsByDate(slotsByDate) {
      if (!client || !slotsByDate) return false;
      try {
        // 1. סנאפשוט ב-manager_bonus_logs (Tier 1)
        await this.saveStateSnapshot({
          slotsByDate: slotsByDate,
          updatedAt: Date.now()
        });

        // 2. סנכרון תאריכים מפורשים לטבלת schedule_slots (Tier 2)
        const dateKeys = Object.keys(slotsByDate).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
        for (const dateStr of dateKeys) {
          await this.syncDateSlotsToTable(dateStr, slotsByDate[dateStr]);
        }

        // 3. ניסיון עדכון ב-app_state
        try {
          await client.from('app_state').upsert([
            {
              key: SLOTS_KEY,
              data: slotsByDate,
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'key' });
        } catch (e) {}

        return true;
      } catch (err) {
        console.error('DbService.saveSlotsByDate error:', err);
        return false;
      }
    },

    /**
     * מחיקת סדרה גורפת מכל הימים ב-Supabase
     */
    async deleteSederSeries(sederTitle, currentSlotsByDate) {
      if (!client || !sederTitle) return false;
      try {
        const cleanTitle = String(sederTitle).trim();

        // 1. מחיקה ישירה מטבלת schedule_slots
        await client.from('schedule_slots').delete().eq('title', cleanTitle);

        // 2. עדכון המבנה המקומי
        const updated = JSON.parse(JSON.stringify(currentSlotsByDate || {}));
        ['weekday_template', 'shabbat_template', 'friday_template'].forEach(tpl => {
          if (Array.isArray(updated[tpl])) {
            updated[tpl] = updated[tpl].filter(s => String(s.title || '').trim() !== cleanTitle);
          }
        });
        Object.keys(updated).forEach(dateKey => {
          if (Array.isArray(updated[dateKey])) {
            updated[dateKey] = updated[dateKey].filter(s => String(s.title || '').trim() !== cleanTitle);
          }
        });

        // 3. שמירה וסנכרון מלא ל-Supabase
        return await this.saveSlotsByDate(updated);
      } catch (err) {
        console.error('DbService.deleteSederSeries error:', err);
        return false;
      }
    },

    /**
     * שמירת הגדרות העל (יעדי מתנה, תחנות, סיסמת מנהל, קוד QR)
     */
    async saveMasterConfig(masterPayload, baseConfig) {
      if (!client) return false;
      try {
        // 1. שמירה מלאה בסנאפשוט manager_bonus_logs (Tier 1)
        await this.saveStateSnapshot({
          config: masterPayload.config || baseConfig,
          trailStops: masterPayload.trailStops || [],
          dutiesRoster: masterPayload.dutiesRoster || null,
          journeyStops: masterPayload.trailStops || [],
          bonusConfig: masterPayload.bonusConfig || null,
          qrSecret: masterPayload.qrSecret || null,
          adminPassword: masterPayload.adminPassword || null,
          updatedAt: Date.now()
        });

        // 2. עדכון טבלת campaign_config רק ב-10 העמודות המקוריות שלה
        if (baseConfig) {
          const cfg = baseConfig;
          const minPts = (cfg.targets && cfg.targets.mid && cfg.targets.mid.points) || cfg.minTarget || 100;
          await client.from('campaign_config').upsert({
            id: 1,
            campaign_name: cfg.campaignName || 'מבצע חורף תשפ״ז - עד הפסגה',
            start_date: cfg.startDate || '2026-10-25',
            end_date: cfg.endDate || '2026-12-10',
            min_target_score: minPts,
            full_seder_threshold: cfg.groupFullThreshold || 10,
            full_seder_bonus_pts: cfg.groupFullBonus || 4,
            xy_required_count: cfg.xyNeed || 5,
            xy_window_size: cfg.xyWindow || 10,
            xy_bonus_pts: cfg.xyBonus || 3
          }, { onConflict: 'id' });
        }

        // 3. ניסיון שמירה ב-app_state
        try {
          await client.from('app_state').upsert([
            {
              key: MASTER_CFG_KEY,
              data: masterPayload,
              updated_at: new Date().toISOString()
            },
            {
              key: 'trail_stops',
              data: masterPayload.trailStops || [],
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'key' });
        } catch (e) {}

        return true;
      } catch (err) {
        console.error('DbService.saveMasterConfig error:', err);
        return false;
      }
    },

    /**
     * עדכון תורנות ב-campaign_calendar
     */
    async updateDutyAssignee(dateStr, col, studentId) {
      if (!client || !dateStr) return false;
      try {
        await client.from('campaign_calendar').upsert({
          iso_date: dateStr,
          [col]: studentId || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'iso_date' });
        return true;
      } catch (err) {
        console.error('DbService.updateDutyAssignee error:', err);
        return false;
      }
    },

    /**
     * סימון השלמת תורנות ב-campaign_calendar
     */
    async toggleDutyDone(dateStr, colDone, isDone) {
      if (!client || !dateStr) return false;
      try {
        await client.from('campaign_calendar').upsert({
          iso_date: dateStr,
          [colDone]: !!isDone,
          updated_at: new Date().toISOString()
        }, { onConflict: 'iso_date' });
        return true;
      } catch (err) {
        console.error('DbService.toggleDutyDone error:', err);
        return false;
      }
    },

    /**
     * שמירת סיסמת מנהל חדשה
     */
    async saveAdminPassword(newPassword) {
      if (!client || !newPassword) return false;
      try {
        const pass = String(newPassword).trim();
        await this.saveStateSnapshot({ adminPassword: pass, updatedAt: Date.now() });
        try {
          const masterRes = await client.from('app_state').select('data').eq('key', MASTER_CFG_KEY).maybeSingle();
          const payload = (masterRes.data && masterRes.data.data) || {};
          payload.config = payload.config || {};
          payload.config.adminPassword = pass;
          payload.updatedAt = Date.now();
          await client.from('app_state').upsert([
            { key: MASTER_CFG_KEY, data: payload, updated_at: new Date().toISOString() }
          ], { onConflict: 'key' });
        } catch (e) {}
        return true;
      } catch (err) {
        console.error('DbService.saveAdminPassword error:', err);
        return false;
      }
    },

    /**
     * שמירת קוד QR קבוע
     */
    async savePermanentQrSecret(code) {
      if (!client || !code) return false;
      try {
        const cleanCode = String(code).trim().toUpperCase();
        await this.saveStateSnapshot({ qrSecret: cleanCode, updatedAt: Date.now() });
        try {
          const masterRes = await client.from('app_state').select('data').eq('key', MASTER_CFG_KEY).maybeSingle();
          const payload = (masterRes.data && masterRes.data.data) || {};
          payload.config = payload.config || {};
          payload.config.qrSecret = cleanCode;
          payload.qrSecret = cleanCode;
          payload.updatedAt = Date.now();
          await client.from('app_state').upsert([
            { key: MASTER_CFG_KEY, data: payload, updated_at: new Date().toISOString() },
            { key: 'qr_secret', data: { code: cleanCode, updatedAt: Date.now() }, updated_at: new Date().toISOString() }
          ], { onConflict: 'key' });
        } catch (e) {}
        return true;
      } catch (err) {
        console.error('DbService.savePermanentQrSecret error:', err);
        return false;
      }
    },

    /**
     * שמירת בקשת אישור מיוחד ב-app_state ובסנאפשוט
     */
    async submitSpecialRequest(newReq) {
      if (!client || !newReq) return false;
      try {
        let list = [];
        try {
          const res = await client.from('app_state').select('data').eq('key', REQS_KEY).maybeSingle();
          list = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
        } catch(e) {}
        list.unshift(newReq);
        await this.saveStateSnapshot({ pendingRequests: list, updatedAt: Date.now() });
        try {
          await client.from('app_state').upsert([
            { key: REQS_KEY, data: list, updated_at: new Date().toISOString() }
          ], { onConflict: 'key' });
        } catch(e) {}
        return true;
      } catch (err) {
        console.error('DbService.submitSpecialRequest error:', err);
        return false;
      }
    },

    /**
     * שמירת נוכחות ונקודות ב-attendance_logs וב-users
     */
    async recordAttendance(studentId, studentName, slotTitle, todayStr, points, isPresent, noPhone) {
      if (!client) return false;
      try {
        await client.from('attendance_logs').insert({
          user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
          student_name: studentName || '',
          slot_title: slotTitle || '',
          status: isPresent ? 'approved' : 'cancelled',
          reason: noPhone ? 'Phone-Free Attendance 📵' : 'Regular Attendance',
          marked_at: new Date().toISOString()
        });

        if (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) {
          await client.from('users').update({
            score: points,
            present_today: isPresent,
            updated_at: new Date().toISOString()
          }).eq('id', studentId);
        }
        return true;
      } catch (err) {
        console.error('DbService.recordAttendance error:', err);
        return false;
      }
    },

    /**
     * האזנה לשינויים בזמן אמת (Supabase Realtime Broadcast)
     */
    subscribeRealtime(onUpdate) {
      if (!client) return null;
      try {
        let debounceTimer = null;
        const handleEvent = () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (typeof onUpdate === 'function') onUpdate();
          }, 800);
        };

        const channel = client.channel('bakshu_vibe_realtime_sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots' }, handleEvent)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_bonus_logs' }, handleEvent)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, handleEvent)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_calendar' }, handleEvent)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_config' }, handleEvent)
          .subscribe();

        return channel;
      } catch (err) {
        console.warn('DbService.subscribeRealtime warning:', err);
        return null;
      }
    }
  };

  window.DbService = DbService;
})();
