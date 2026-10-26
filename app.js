/**
 * app.js - פונקציות עזר, סנכרון יומנים, יצירת תזכורות והודעות וואטסאפ/SMS
 */

(function() {
  const g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});

  const App = {
    getTodayIso() {
      return new Date().toISOString().slice(0, 10);
    },

    getHebrewDayName(isoDate) {
      const d = isoDate ? new Date(isoDate) : new Date();
      const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      return `יום ${days[d.getDay()]}`;
    },

    formatHebrewDateBadge(isoDate) {
      const d = isoDate ? new Date(isoDate) : new Date();
      const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      const dStr = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
      return `יום ${days[d.getDay()]} • ${dStr}`;
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

    buildDutyReminderText(student, isoDate, role, baseUrl) {
      const name = student?.full_name || student?.name || 'תלמיד יקר';
      const isWaker = role.includes('מעורר');
      const roleText = isWaker ? 'השכמת בוקר (מעורר לתפילה ב-06:45)' : 'תורנות מטבח וחדר אוכל (19:30)';
      
      const gcalUrl = this.getGoogleCalendarUrl({
        title: `תורנות בישיבה: ${roleText}`,
        details: `תורנות אישית ששובצה עבורך בישיבת בקשו. (+3 נקודות למבצע)`,
        startIso: isWaker ? `${isoDate}T06:45:00` : `${isoDate}T19:30:00`,
        endIso: isWaker ? `${isoDate}T07:45:00` : `${isoDate}T20:30:00`,
        isAllDay: false
      });

      return `שלום ${name}! 🌟\nתזכורת לתורנות שלך בישיבת בקשו בתאריך ${isoDate}:\nתפקיד: ${roleText}\n\nלהוספה ישירה ליומן Google שלך:\n${gcalUrl}\n\nיישר כוח! (+3 נקודות)`;
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
