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
    // קישורי Google Calendar חכמים
    // ==========================================
    getGoogleCalendarUrl({ title, details, startIso, endIso, isAllDay }) {
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
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${cleanTitle}&dates=${datesParam}&details=${cleanDetails}`;
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
    // חישוב פוטנציאל נקודות מרבי במבצע
    // ==========================================
    calculateCampaignPotential(cfg, scheduleSlots, duties, studentId) {
      const sDateStr = cfg?.startDate || '2026-10-25';
      const eDateStr = cfg?.endDate || '2027-02-08';
      const start = new Date(sDateStr);
      const end = new Date(eDateStr);

      let totalSlotsCount = 0;
      let totalSlotsPoints = 0;
      const slotsMap = scheduleSlots || {};

      const cur = new Date(start);
      while (cur <= end) {
        const iso = cur.toISOString().slice(0, 10);
        const daySlots = slotsMap[iso] || (cur.getDay() === 6 ? [] : [
          { points: 1 }, { points: 1 }, { points: 1 }
        ]);
        daySlots.forEach(s => {
          totalSlotsCount++;
          totalSlotsPoints += (Number(s.points) || 1);
        });
        cur.setDate(cur.getDate() + 1);
      }

      // 1. Sedarim Points
      const sedarimPoints = totalSlotsPoints;

      // 2. Phone Free Bonus (1 point per slot)
      const noPhoneBonus = Number(cfg?.bonusConfig?.noPhoneBonus) || 1;
      const phoneFreePoints = totalSlotsCount * noPhoneBonus;

      // 3. Duties Points
      const wBonus = Number(cfg?.bonusConfig?.wakeupBonus) || 3;
      const kBonus = Number(cfg?.bonusConfig?.kitchenBonus) || 3;
      let dutiesPoints = 0;
      let assignedDutiesCount = 0;

      if (duties && studentId) {
        Object.values(duties).forEach(d => {
          if (String(d.wakeupStudentId) === String(studentId)) {
            dutiesPoints += wBonus;
            assignedDutiesCount++;
          }
          if (String(d.kitchenStudentId) === String(studentId)) {
            dutiesPoints += kBonus;
            assignedDutiesCount++;
          }
        });
      }

      // Ensure minimum standard quota is displayed if unassigned
      const potentialDutyPts = Math.max(dutiesPoints, (wBonus + kBonus));

      // 4. Full Seder & Group bonus (estimated active full seders)
      const fullSederPts = (Number(cfg?.fullSederBonusPts) || 1) * 10;

      const totalPotential = sedarimPoints + phoneFreePoints + potentialDutyPts + fullSederPts;

      return {
        totalSlotsCount,
        sedarimPoints,
        phoneFreePoints,
        dutiesPoints: potentialDutyPts,
        assignedDutiesCount,
        fullSederPts,
        totalPotential
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
