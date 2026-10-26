/**
 * db_service.js - שירות ענן מרכזי ויחיד עבור מערכת 'בקשו VIBE'
 * מתחבר ישירות ל-Supabase כמקור אמת בלעדי (Single Source of Truth)
 * בהתאמה מלאה לסכמת העמודות הקיימת (מונע שגיאות 400 Bad Request)
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
        const [appStateRes, usersRes, cfgRes, calRes] = await Promise.all([
          client.from('app_state').select('*'),
          client.from('users').select('*').order('created_at', { ascending: true }),
          client.from('campaign_config').select('*').eq('id', 1).maybeSingle(),
          client.from('campaign_calendar').select('*')
        ]);

        const stateRows = appStateRes.data || [];
        const masterRow = stateRows.find(r => r.key === MASTER_CFG_KEY);
        const slotsRow = stateRows.find(r => r.key === SLOTS_KEY);
        const reqsRow = stateRows.find(r => r.key === REQS_KEY || r.key === 'pending_requests');

        return {
          appStateRows: stateRows,
          masterConfig: masterRow ? masterRow.data : null,
          slotsByDate: slotsRow ? slotsRow.data : null,
          pendingRequests: reqsRow ? reqsRow.data : null,
          users: usersRes.data || [],
          campaignConfig: cfgRes.data || null,
          calendarRows: calRes.data || []
        };
      } catch (err) {
        console.error('DbService.loadAllData error:', err);
        return null;
      }
    },

    /**
     * שמירת הגדרות העל (יעדי מתנה, תחנות, סיסמת מנהל, קוד QR)
     * שומר ב-app_state תחת 'bakshu_master_config_v5' וב-campaign_config רק בעמודות הקיימות!
     */
    async saveMasterConfig(masterPayload, baseConfig) {
      if (!client) return false;
      try {
        // 1. שמירה מלאה של כל המבנים המורכבים ב-app_state
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

        return true;
      } catch (err) {
        console.error('DbService.saveMasterConfig error:', err);
        return false;
      }
    },

    /**
     * שמירת לוח הזמנים (slots_by_date) ב-app_state
     */
    async saveSlotsByDate(slotsByDate) {
      if (!client) return false;
      try {
        await client.from('app_state').upsert([
          {
            key: SLOTS_KEY,
            data: slotsByDate,
            updated_at: new Date().toISOString()
          }
        ], { onConflict: 'key' });
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
      if (!client || !currentSlotsByDate || !sederTitle) return false;
      try {
        const cleanTitle = String(sederTitle).trim();
        const updated = JSON.parse(JSON.stringify(currentSlotsByDate));

        // הסרה מתבניות
        ['weekday_template', 'shabbat_template'].forEach(tpl => {
          if (Array.isArray(updated[tpl])) {
            updated[tpl] = updated[tpl].filter(s => String(s.title || '').trim() !== cleanTitle);
          }
        });

        // הסרה מכל תאריכי המבצע
        Object.keys(updated).forEach(dateKey => {
          if (Array.isArray(updated[dateKey])) {
            updated[dateKey] = updated[dateKey].filter(s => String(s.title || '').trim() !== cleanTitle);
          }
        });

        return await this.saveSlotsByDate(updated);
      } catch (err) {
        console.error('DbService.deleteSederSeries error:', err);
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
     * שמירת סיסמת מנהל חדשה ב-app_state
     */
    async saveAdminPassword(newPassword) {
      if (!client || !newPassword) return false;
      try {
        const masterRes = await client.from('app_state').select('data').eq('key', MASTER_CFG_KEY).maybeSingle();
        const payload = (masterRes.data && masterRes.data.data) || {};
        payload.config = payload.config || {};
        payload.config.adminPassword = String(newPassword).trim();
        payload.updatedAt = Date.now();

        await client.from('app_state').upsert([
          { key: MASTER_CFG_KEY, data: payload, updated_at: new Date().toISOString() }
        ], { onConflict: 'key' });
        return true;
      } catch (err) {
        console.error('DbService.saveAdminPassword error:', err);
        return false;
      }
    },

    /**
     * שמירת קוד QR קבוע ב-app_state
     */
    async savePermanentQrSecret(code) {
      if (!client || !code) return false;
      try {
        const masterRes = await client.from('app_state').select('data').eq('key', MASTER_CFG_KEY).maybeSingle();
        const payload = (masterRes.data && masterRes.data.data) || {};
        payload.config = payload.config || {};
        payload.config.qrSecret = String(code).trim().toUpperCase();
        payload.qrSecret = payload.config.qrSecret;
        payload.updatedAt = Date.now();

        await client.from('app_state').upsert([
          { key: MASTER_CFG_KEY, data: payload, updated_at: new Date().toISOString() },
          { key: 'qr_secret', data: { code: payload.qrSecret, updatedAt: Date.now() }, updated_at: new Date().toISOString() }
        ], { onConflict: 'key' });
        return true;
      } catch (err) {
        console.error('DbService.savePermanentQrSecret error:', err);
        return false;
      }
    },

    /**
     * שמירת בקשת אישור מיוחד ב-app_state
     */
    async submitSpecialRequest(newReq) {
      if (!client || !newReq) return false;
      try {
        const res = await client.from('app_state').select('data').eq('key', REQS_KEY).maybeSingle();
        let list = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];
        list.unshift(newReq);
        await client.from('app_state').upsert([
          { key: REQS_KEY, data: list, updated_at: new Date().toISOString() }
        ], { onConflict: 'key' });
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
        // רשומת נוכחות
        await client.from('attendance_logs').insert({
          user_id: (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) ? studentId : null,
          student_name: studentName || '',
          slot_title: slotTitle || '',
          status: isPresent ? 'approved' : 'cancelled',
          reason: noPhone ? 'Phone-Free Attendance 📵' : 'Regular Attendance',
          marked_at: new Date().toISOString()
        });

        // עדכון ניקוד ב-users אם מדובר ב-UUID חוקי
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
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, handleEvent)
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

  // חשיפה גלובלית בחלון הדפדפן
  window.DbService = DbService;
})();
