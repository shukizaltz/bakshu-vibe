/**
 * app.js - פונקציות עזר, סנכרון יומנים, יצירת תזכורות והודעות וואטסאפ/SMS
 */

(function() {
  const g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});

  const App = {
    getTodayIso() {
      return new Date().toISOString().slice(0, 10);
    },

    toHebrewNumber(n) {
      if (!n || n <= 0) return '';
      if (n === 15) return 'ט״ו';
      if (n === 16) return 'ט״ז';
      const map = [
        [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
        [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
        [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
      ];
      let res = '';
      let rem = n;
      for (const [val, char] of map) {
        while (rem >= val) {
          if (rem === 15) { res += 'טו'; rem = 0; break; }
          if (rem === 16) { res += 'טז'; rem = 0; break; }
          res += char;
          rem -= val;
        }
      }
      if (res.length === 1) return res + '׳';
      return res.slice(0, -1) + '״' + res.slice(-1);
    },

    getHebrewDateDetails(isoDate) {
      try {
        const d = isoDate ? new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : '')) : new Date();
        const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const parts = formatter.formatToParts(d);
        let dayNum = 1, monthName = '', yearNum = 5787;
        for (const p of parts) {
          if (p.type === 'day') dayNum = parseInt(p.value, 10);
          if (p.type === 'month') monthName = p.value;
          if (p.type === 'year') yearNum = parseInt(p.value, 10);
        }
        const dayHeb = this.toHebrewNumber(dayNum);
        const yearHeb = this.toHebrewNumber(yearNum % 1000);
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dayName = days[d.getDay()];

        return {
          dayHeb,
          monthName,
          yearHeb,
          dayName: `יום ${dayName}`,
          fullHebrewDate: `${dayHeb} ב${monthName} ${yearHeb}`,
          fullWithDay: `יום ${dayName}, ${dayHeb} ב${monthName} ${yearHeb}`,
          shortHebrew: `${dayHeb} ${monthName}`
        };
      } catch (e) {
        return {
          dayHeb: '',
          monthName: '',
          yearHeb: '',
          dayName: this.getHebrewDayName(isoDate),
          fullHebrewDate: '',
          fullWithDay: this.getHebrewDayName(isoDate),
          shortHebrew: ''
        };
      }
    },

    getHebrewDayName(isoDate) {
      const d = isoDate ? new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : '')) : new Date();
      const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      return `יום ${days[d.getDay()]}`;
    },

    formatHebrewDateBadge(isoDate) {
      const heb = this.getHebrewDateDetails(isoDate);
      const d = isoDate ? new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : '')) : new Date();
      const greg = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
      return `${heb.fullWithDay} • ${greg}`;
    },

    // ==========================================
    // קישורי Google Calendar חכמים + יומן דינאמי מתעדכן
    // ==========================================
    getGoogleCalendarUrl({ title, details, startIso, endIso, isAllDay, rrule }) {
      const cleanTitle = encodeURIComponent(title || 'מבצע בקשו VIBE');
      const cleanDetails = encodeURIComponent(details || 'ישיבת בקשו ירושלים');
      
      let datesParam = '';
      if (isAllDay) {
        const dStr = (startIso || '2026-11-19').replace(/-/g, '').slice(0, 8);
        const [y, m, d] = (startIso || '2026-11-19').split('-').map(Number);
        const nextDt = new Date(y, m - 1, d + 1);
        const nextDStr = `${nextDt.getFullYear()}${String(nextDt.getMonth() + 1).padStart(2, '0')}${String(nextDt.getDate()).padStart(2, '0')}`;
        datesParam = `${dStr}/${nextDStr}`;
      } else {
        const pad = (n) => String(n).padStart(2, '0');
        const formatDt = (iso, timeStr) => {
          const [h, mi] = (timeStr || '09:00').split(':');
          return `${iso.replace(/-/g, '')}T${pad(h)}${pad(mi)}00`;
        };
        const sTime = startIso.includes('T') ? startIso.replace(/[-:]/g, '').slice(0, 15) : formatDt(startIso, '07:00');
        const eTime = endIso.includes('T') ? endIso.replace(/[-:]/g, '').slice(0, 15) : formatDt(endIso || startIso, '08:00');
        datesParam = `${sTime}/${eTime}`;
      }
      const recurParam = rrule ? `&recur=${encodeURIComponent(rrule)}` : '';
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${cleanTitle}&dates=${datesParam}&details=${cleanDetails}&ctz=Asia/Jerusalem${recurParam}`;
    },

    getDynamicCalendarUrls({ role = 'student', studentId = '' } = {}) {
      const host = (typeof window !== 'undefined' && window.location?.host && !window.location.host.includes('localhost'))
        ? window.location.host
        : 'bakshu-vibe.vercel.app';
      const params = new URLSearchParams();
      if (role === 'admin') {
        params.set('role', 'admin');
      } else if (studentId) {
        params.set('studentId', String(studentId));
      }
      const qs = params.toString();
      const path = `/api/calendar${qs ? '?' + qs : ''}`;
      const httpsUrl = `https://${host}${path}`;
      const webcalUrl = `webcal://${host}${path}`;
      const googleSubscribeUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
      return { httpsUrl, webcalUrl, googleSubscribeUrl };
    },

    openDynamicGoogleCalendarModal({ role = 'student', studentId = '', studentName = '', config = {}, scheduleSlots = {}, duties = {}, students = [] } = {}) {
      const isAdmin = role === 'admin';
      const urls = this.getDynamicCalendarUrls({ role, studentId });
      const todayIso = this.getTodayIsraelDate();
      const endDateClean = (config?.endDate || '2027-02-08').replace(/-/g, '') + 'T235959Z';
      const dCfg = config?.dutiesConfig || {
        duty1Name: 'תורן מעורר (בוקר)',
        duty1Hour: '06:30',
        duty1ReminderHour: '21:30',
        duty2Name: 'תורן מטבח (צהריים/ערב)',
        duty2Hour: '12:00',
        duty2ReminderHour: '11:00'
      };

      // שליפת סדרי היום לקישורים ישירים ב-Google Calendar עם חזרה יומית (RRULE)
      const daySlots = Array.isArray(scheduleSlots?.[todayIso]) && scheduleSlots[todayIso].length > 0
        ? scheduleSlots[todayIso]
        : [
            { title: 'סדר א׳ (עיון)', openTime: '09:00', lockTime: '13:00', points: 1 },
            { title: 'סדר ב׳ (בקיאות)', openTime: '16:00', lockTime: '19:00', points: 1 },
            { title: 'סדר ג׳ (ערב)', openTime: '20:30', lockTime: '22:30', points: 1 }
          ];

      const sederLinksHtml = daySlots.map(sl => {
        const gUrl = this.getGoogleCalendarUrl({
          title: `📖 ${sl.title} (${sl.points || 1} נק׳) | ישיבת בקשו`,
          details: `סדר לימוד קבוע במבצע 'עד הפסגה' בישיבת בקשו (${sl.openTime} - ${sl.lockTime}).\n⏰ תזכורת: לא לשכוח להפקיד טלפון (+1 נק׳) ולסמן נוכחות בפורטל!`,
          startIso: `${todayIso}T${sl.openTime || '09:00'}:00`,
          endIso: `${todayIso}T${sl.lockTime || '12:00'}:00`,
          isAllDay: false,
          rrule: `RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH;UNTIL=${endDateClean}`
        });
        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span class="font-black text-slate-900 block">📖 ${sl.title}</span>
              <span class="text-[11px] text-slate-500 font-outfit" dir="ltr">${sl.openTime} - ${sl.lockTime} • סדרה קבועה בימי א׳-ה׳</span>
            </div>
            <a href="${gUrl}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] shadow-xs transition flex items-center gap-1 shrink-0">
              <span>📅</span><span>הוסף ל-Google</span>
            </a>
          </div>
        `;
      }).join('');

      // שליפת תורנויות קרובות לקישור ישיר ל-Google Calendar
      const allDutyDates = Object.keys(duties || {}).filter(d => d >= todayIso).sort();
      const relevantDuties = [];
      allDutyDates.forEach(d => {
        const item = duties[d];
        if (!item) return;
        if (isAdmin) {
          if (item.wakeupStudentId) {
            const stObj = (students || []).find(s => String(s.id) === String(item.wakeupStudentId));
            relevantDuties.push({ date: d, roleTitle: `${dCfg.duty1Name}: ${stObj?.full_name || 'תורן'}`, hour: dCfg.duty1Hour || '06:30', remHour: dCfg.duty1ReminderHour || '21:30' });
          }
          if (item.kitchenStudentId) {
            const stObj = (students || []).find(s => String(s.id) === String(item.kitchenStudentId));
            relevantDuties.push({ date: d, roleTitle: `${dCfg.duty2Name}: ${stObj?.full_name || 'תורן'}`, hour: dCfg.duty2Hour || '12:00', remHour: dCfg.duty2ReminderHour || '11:00' });
          }
        } else if (studentId) {
          if (String(item.wakeupStudentId) === String(studentId)) {
            relevantDuties.push({ date: d, roleTitle: `תורנות שלי: ${dCfg.duty1Name} (+3 נק׳)`, hour: dCfg.duty1Hour || '06:30', remHour: dCfg.duty1ReminderHour || '21:30' });
          }
          if (String(item.kitchenStudentId) === String(studentId)) {
            relevantDuties.push({ date: d, roleTitle: `תורנות שלי: ${dCfg.duty2Name} (+3 נק׳)`, hour: dCfg.duty2Hour || '12:00', remHour: dCfg.duty2ReminderHour || '11:00' });
          }
        }
      });

      const dutiesLinksHtml = relevantDuties.slice(0, 6).map(du => {
        const [hh, mm] = (du.hour || '06:30').split(':').map(Number);
        const endH = String(Math.min(23, (hh || 6) + 1)).padStart(2, '0');
        const endM = String(mm || 0).padStart(2, '0');
        const gUrl = this.getGoogleCalendarUrl({
          title: `🧹 ${du.roleTitle} | ישיבת בקשו`,
          details: `תורנות בישיבת בקשו בתאריך ${du.date} בשעה ${du.hour} (שעת תזכורת מומלצת: ${du.remHour}).`,
          startIso: `${du.date}T${du.hour}:00`,
          endIso: `${du.date}T${endH}:${endM}:00`,
          isAllDay: false
        });
        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs">
            <div>
              <span class="font-black text-amber-950 block">🧹 ${du.roleTitle}</span>
              <span class="text-[11px] text-amber-800 font-outfit" dir="ltr">${du.date} • שעה ${du.hour} (תזכורת: ${du.remHour})</span>
            </div>
            <a href="${gUrl}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[11px] shadow-xs transition flex items-center gap-1 shrink-0">
              <span>📅</span><span>הוסף ל-Google</span>
            </a>
          </div>
        `;
      }).join('');

      let modal = document.getElementById('dynamicGoogleCalendarModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dynamicGoogleCalendarModal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
      }

      modal.classList.remove('hidden');
      modal.innerHTML = `
        <div class="bg-white text-slate-900 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-indigo-100 space-y-4 max-h-[90vh] overflow-y-auto custom-scroll relative" dir="rtl">
          <button type="button" onclick="document.getElementById('dynamicGoogleCalendarModal').classList.add('hidden')" class="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center cursor-pointer">✕</button>

          <div class="flex items-center gap-3 pr-1">
            <div class="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl shadow-md shrink-0">📅</div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-slate-900">חיבור ליומן Google מתעדכן דינאמית</h3>
              <p class="text-xs text-slate-500">${isAdmin ? 'יומן ראש הישיבה: כל הסדרים, התורנים ותחנות העצירה עם תזכורות' : `יומן אישי (${studentName || 'בחור'}): כל הסדרים והתורנויות שלך עם תזכורות`}</p>
            </div>
          </div>

          <!-- 1. Primary Dynamic Google Calendar Subscription -->
          <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-emerald-50 border-2 border-indigo-200 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-black text-indigo-950">🔄 1. מנוי יומן חי המתעדכן אוטומטית מהמערכת:</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black">מומלץ • כולל תזכורות</span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">
              לחיצה על הכפתור תחבר את חשבון ה-Google Calendar שלך לקישור החי של הישיבה. כל שינוי של סדר, שעה, עצירה או תורנות במערכת מתעדכן ביומן שלך אוטומטית, כולל התראות לפני תחילת כל סדר ותורנות!
            </p>
            <div class="flex flex-col sm:flex-row gap-2">
              <a href="${urls.googleSubscribeUrl}" target="_blank" rel="noopener" class="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm text-center shadow-lg transition flex items-center justify-center gap-2">
                <span>📅</span>
                <span>חבר כעת ל-Google Calendar (מתעדכן)</span>
              </a>
              <a href="${urls.webcalUrl}" class="py-3 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs text-center shadow transition flex items-center justify-center gap-1.5" title="פתיחה ישירה באפליקציית היומן של הטלפון">
                <span>📱</span>
                <span>חיבור ליומן בנייד</span>
              </a>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <input type="text" readonly value="${urls.httpsUrl}" class="flex-1 p-2 rounded-xl bg-white border border-slate-300 text-[11px] font-mono text-slate-600 select-all" dir="ltr">
              <button type="button" onclick="navigator.clipboard.writeText('${urls.httpsUrl}'); App.showToast('קישור היומן הדינאמי הועתק ללוח! 📋', '✓');" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer shrink-0">
                📋 העתק קישור
              </button>
            </div>
          </div>

          <!-- 2. Direct One-Click Recurring Sedarim in Google Calendar -->
          <div class="space-y-2">
            <h4 class="text-xs font-black text-slate-800">⏰ 2. הוספת סדרי הלימוד הקבועים ישירות לאפליקציית Google Calendar:</h4>
            <div class="space-y-1.5">
              ${sederLinksHtml}
            </div>
          </div>

          <!-- 3. Direct One-Click Duties in Google Calendar -->
          <div class="space-y-2">
            <h4 class="text-xs font-black text-slate-800">🧹 3. תורנויות קרובות להוספה ב-Google Calendar (עם תזכורת):</h4>
            <div class="space-y-1.5">
              ${dutiesLinksHtml || '<div class="text-xs text-slate-400 py-2 text-center bg-slate-50 rounded-xl border border-slate-100">אין תורנויות קרובות משובצות כרגע</div>'}
            </div>
          </div>
        </div>
      `;
    },

    // ==========================================
    // הודעות WhatsApp ו-SMS מותאמות אישית
    // ==========================================
    buildStudentInviteText(student, baseUrl) {
      const name = student?.full_name || student?.name || 'תלמיד יקר';
      const phone = student?.phone || '';
      const pass = student?.password || '1234';
      const link = `${baseUrl || window.location.origin}/?phone=${encodeURIComponent(phone)}`;

      return `שלום ${name}! 🚀\nברוך הבא למבצע 'עד הפסגה' בישיבת בקשו!\n\nהנה קישור הכניסה האישי שלך (כניסה אוטומטית):\n${link}\n\nסיסמתך האישית: ${pass}\nעולים ביחד לפסגה!`;
    },

    getTodayIsraelDate() {
      try {
        const nf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
        return nf.format(new Date());
      } catch (e) {
        return new Date().toISOString().slice(0, 10);
      }
    },

    buildDutyReminderText(student, isoDate, role, baseUrl, dutyHour) {
      const name = student?.full_name || student?.name || 'תלמיד יקר';
      const hebDate = (this.getHebrewDateDetails ? this.getHebrewDateDetails(isoDate).fullWithDay : isoDate);
      const timeStr = dutyHour ? ` (שעה: ${dutyHour})` : '';
      
      const gcalUrl = this.getGoogleCalendarUrl({
        title: `תורנות בישיבה: ${role}`,
        details: `תורנות ששובצה עבורך בישיבת בקשו (${role}). יישר כוח ובהצלחה!`,
        startIso: `${isoDate}T${dutyHour ? dutyHour.padStart(5, '0') : '07:00'}:00`,
        endIso: `${isoDate}T${dutyHour ? dutyHour.padStart(5, '0') : '08:00'}:00`,
        isAllDay: false
      });

      return `שלום ${name}! 🌟\nתזכורת ידידותית: הינך משובץ לתורנות *${role}* בישיבה ב${hebDate}${timeStr}.\n\n📅 להוספה ישירה ליומן Google Calendar:\n${gcalUrl}\n\nיישר כוח ובהצלחה רבה! 💪`;
    },

    // ==========================================
    // חישוב פוטנציאל נקודות מרבי במבצע - סדרים בלבד (ללא בונוסים ותורנויות)
    // 1. כמה ניתן לצבור (פוטנציאל סדרים כללי של המבצע)
    // 2. כמה בחור מסוים יכול לצבור (ניקוד שנצבר + סדרים שנותרו)
    // 3. כמה צבר (נצבר בפועל)
    // ==========================================
    calculateCampaignPotential(cfg, scheduleSlots, duties, studentId, studentScore = 0) {
      const sDateStr = cfg?.startDate || '2026-10-25';
      const eDateStr = cfg?.endDate || '2027-02-08';
      const [sy, sm, sd] = sDateStr.split('-').map(Number);
      const [ey, em, ed] = eDateStr.split('-').map(Number);
      const cur = new Date(sy, (sm || 1) - 1, sd || 1, 12, 0, 0);
      const end = new Date(ey, (em || 1) - 1, ed || 1, 12, 0, 0);

      let totalSlotsCount = 0;
      let totalSlotsPoints = 0;
      let pastSlotsCount = 0;
      let pastSlotsPoints = 0;
      let remainingSlotsCount = 0;
      let remainingSlotsPoints = 0;
      const todayIso = this.getTodayIsraelDate ? this.getTodayIsraelDate() : new Date().toISOString().slice(0, 10);
      const slotsMap = scheduleSlots || {};

      while (cur <= end) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const daySlots = Array.isArray(slotsMap[iso])
          ? slotsMap[iso]
          : ((g.Db && typeof g.Db.getDefaultSlotsForIsoDate === 'function') ? g.Db.getDefaultSlotsForIsoDate(iso) : []);
        const isFutureOrToday = (iso >= todayIso);
        daySlots.forEach(s => {
          const pts = (Number(s.points) || 1);
          totalSlotsCount++;
          totalSlotsPoints += pts;
          if (isFutureOrToday) {
            remainingSlotsCount++;
            remainingSlotsPoints += pts;
          } else {
            pastSlotsCount++;
            pastSlotsPoints += pts;
          }
        });
        cur.setDate(cur.getDate() + 1);
      }

      // פוטנציאל נקודות מבוסס על סדרי הלימוד בלבד (ללא בונוסים וללא תורנויות)
      const sedarimPoints = totalSlotsPoints;
      const phoneFreePoints = 0;
      const potentialDutyPts = 0;
      const assignedDutiesCount = 0;
      const fullSederPts = 0;

      // 1. כמה ניתן לצבור במבצע כולו (סך נקודות כל הסדרים במבצע)
      const campaignMax = sedarimPoints;

      // 2. כמה בחור מסוים יכול לצבור (מה שצבר עד כה + נקודות הסדרים שנותרו, עד תקרת סדרי המבצע)
      const score = Number(studentScore) || 0;
      const remainingPotential = remainingSlotsPoints;
      const personalMax = Math.max(score, Math.min(campaignMax, score + remainingPotential));

      // יעדי המבצע המוגדרים
      const targets = {
        min: { name: cfg?.targets?.min?.name || 'יעד 1', points: Number(cfg?.targets?.min?.points) || 100, reward: cfg?.targets?.min?.reward || 'פרס כניסה' },
        mid: { name: cfg?.targets?.mid?.name || 'יעד 2', points: Number(cfg?.targets?.mid?.points) || 200, reward: cfg?.targets?.mid?.reward || 'פרס ביניים' },
        max: { name: cfg?.targets?.max?.name || 'הפסגה', points: Number(cfg?.targets?.max?.points) || 350, reward: cfg?.targets?.max?.reward || 'פרס הפסגה' }
      };

      // היעד הבא
      let nextTarget = targets.min;
      if (score >= targets.mid.points) {
        nextTarget = targets.max;
      } else if (score >= targets.min.points) {
        nextTarget = targets.mid;
      }
      const ptsToNextTarget = Math.max(0, nextTarget.points - score);
      const ptsToSummit = Math.max(0, targets.max.points - score);
      const pctOfSummit = Math.min(100, Math.round((score / targets.max.points) * 100));
      const pctOfCampaign = campaignMax > 0 ? Math.min(100, Math.round((score / campaignMax) * 100)) : 0;

      return {
        totalSlotsCount,
        pastSlotsCount,
        pastSlotsPoints,
        remainingSlotsCount,
        remainingSlotsPoints,
        sedarimPoints,
        phoneFreePoints,
        dutiesPoints: potentialDutyPts,
        assignedDutiesCount,
        fullSederPts,
        totalPotential: campaignMax, // לתאימות לאחור
        campaignMax,                // 1. כמה ניתן לצבור בכל המבצע (סדרים בלבד)
        personalMax,                // 2. כמה בחור מסוים יכול לצבור (סדרים בלבד)
        score,                      // 3. כמה צבר בפועל
        targets,
        nextTarget,
        ptsToNextTarget,
        ptsToSummit,
        pctOfSummit,
        pctOfCampaign
      };
    },

    // ==========================================
    // הורדת קובץ יומן מלא (.ics)
    // ==========================================
    downloadIcs(filename, eventsContent) {
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Bakshu VIBE//Campaign//HE',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:מבצע בקשו VIBE - עד הפסגה',
        eventsContent || '',
        'END:VCALENDAR'
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename || 'מבצע_בקשו.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    // ==========================================
    // הודעות Toast מודרניות
    // ==========================================
    showToast(message, icon = 'ℹ️') {
      let container = document.getElementById('toastContainer');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-50 pointer-events-none space-y-2';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = 'p-3 rounded-2xl bg-slate-900/95 text-white text-xs font-bold shadow-2xl border border-white/20 flex items-center gap-2 transition-all transform duration-300 pointer-events-auto';
      toast.innerHTML = `<span class="text-base">${icon}</span><span>${message}</span>`;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  };

  g.App = App;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
  }
})();
