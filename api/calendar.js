/**
 * api/calendar.js - יומן Google דינאמי מתעדכן בזמן אמת (Live iCalendar Feed)
 * מסתנכרן ישירות מול מסד הנתונים החי ב-Supabase עבור:
 * 1. ראש הישיבה (?role=admin) - כל סדרי הלימוד, כל התורנים המשובצים, תחנות עצירה ואירועים מיוחדים + תזכורות
 * 2. בחור בישיבה (?studentId=<uuid>) - כל סדרי הלימוד, התורנויות האישיות של הבחור, תחנות עצירה ואירועים + תזכורות
 */

const SUPABASE_URL = 'https://apuuuubjrhejknyvzvpn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DuJUmTpWwU4h3P8r1htVWw_24i-VjeG';

async function sbFetch(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) return [];
  return await res.json();
}

function getDefaultSlotsForIsoDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 5) return []; // יום שישי
  if (dow === 6) {
    return [
      { title: 'סדר שחרית (קודם התפילה)', openTime: '08:00', lockTime: '10:00', points: 2 },
      { title: 'סדר שבת אחה״צ', openTime: '16:00', lockTime: '19:00', points: 2 }
    ];
  }
  return [
    { title: 'סדר א׳ (עיון)', openTime: '09:00', lockTime: '13:00', points: 1 },
    { title: 'סדר ב׳ (בקיאות)', openTime: '16:00', lockTime: '19:00', points: 1 },
    { title: 'סדר ג׳ (ערב)', openTime: '20:30', lockTime: '22:30', points: 1 }
  ];
}

function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatTimeHHMMSS(timeStr, fallback = '09:00') {
  const parts = String(timeStr || fallback).trim().split(':');
  const hh = String(Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0))).padStart(2, '0');
  return `${hh}${mm}00`;
}

function addOneHourHHMMSS(timeStr, fallback = '07:00') {
  const parts = String(timeStr || fallback).trim().split(':');
  const hh = Math.min(23, Math.max(0, (parseInt(parts[0], 10) || 0) + 1));
  const mm = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
}

function computeReminderMinutesBefore(eventTimeStr, reminderTimeStr, isEveningBefore = false) {
  const [eh, em] = String(eventTimeStr || '06:30').split(':').map(n => parseInt(n, 10) || 0);
  const [rh, rm] = String(reminderTimeStr || '21:30').split(':').map(n => parseInt(n, 10) || 0);
  const eventMins = eh * 60 + em;
  const remMins = rh * 60 + rm;
  if (isEveningBefore || remMins > eventMins) {
    // תזכורת בערב שלפני (למשל 21:30 בערב לפני 06:30 בבוקר)
    return (24 * 60 - remMins) + eventMins;
  }
  return Math.max(10, eventMins - remMins);
}

function nextDateClean(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

module.exports = async function handler(req, res) {
  try {
    const urlObj = new URL(req.url, `https://${req.headers.host || 'bakshu-vibe.vercel.app'}`);
    const role = urlObj.searchParams.get('role') || 'student';
    const studentId = urlObj.searchParams.get('studentId') || '';
    const isAdmin = role === 'admin';

    const [settingsRows, slotsRows, calRows, usersRows] = await Promise.all([
      sbFetch('campaign_settings', 'select=*&id=eq.1'),
      sbFetch('schedule_slots', 'select=*&order=slot_date.asc,open_time.asc'),
      sbFetch('campaign_calendar', 'select=*&order=date_str.asc'),
      sbFetch('users', 'select=id,full_name,phone,role')
    ]);

    const rawCfg = settingsRows?.[0]?.bonus_config || {};
    const startDate = settingsRows?.[0]?.start_date || rawCfg.startDate || '2026-10-25';
    const endDate = settingsRows?.[0]?.end_date || rawCfg.endDate || '2027-02-08';
    const trailStops = Array.isArray(rawCfg.trailStops) ? rawCfg.trailStops : [];
    const dCfg = rawCfg.dutiesConfig || {
      duty1Name: 'תורן מעורר (בוקר)',
      duty1Hour: '06:30',
      duty1ReminderHour: '21:30',
      duty2Name: 'תורן מטבח (צהריים/ערב)',
      duty2Hour: '12:00',
      duty2ReminderHour: '11:00'
    };

    const userMap = {};
    (usersRows || []).forEach(u => {
      userMap[String(u.id)] = u.full_name || 'בחור';
    });

    const studentName = studentId && userMap[String(studentId)] ? userMap[String(studentId)] : '';
    const calName = isAdmin
      ? 'בקשו VIBE | יומן ראש הישיבה (סדרים, תורנויות ועצירות)'
      : (studentName ? `בקשו VIBE | יומן אישי – ${studentName}` : 'בקשו VIBE | יומן סדרים ומבצע – עד הפסגה');

    // מיפוי סדרים לפי תאריך
    const slotsByDate = {};
    (slotsRows || []).forEach(r => {
      const d = r.slot_date;
      if (!d) return;
      if (!slotsByDate[d]) slotsByDate[d] = [];
      if (r.title === '__DAY_CLEARED__') {
        slotsByDate[d] = [];
        slotsByDate[d]._cleared = true;
        return;
      }
      if (slotsByDate[d]._cleared) return;
      slotsByDate[d].push({
        title: r.title || 'סדר לימוד',
        openTime: (r.open_time || '09:00').slice(0, 5),
        lockTime: (r.lock_time || '12:00').slice(0, 5),
        points: Number(r.points) || 1
      });
    });

    // מיפוי תורנויות ואירועים לפי תאריך
    const dutiesByDate = {};
    (calRows || []).forEach(r => {
      if (!r.date_str) return;
      dutiesByDate[r.date_str] = {
        specialEventTitle: r.special_event || '',
        wakeupStudentId: r.wakeup_student_id ? String(r.wakeup_student_id) : '',
        kitchenStudentId: r.kitchen_student_id ? String(r.kitchen_student_id) : ''
      };
    });

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const events = [];

    // 1. תחנות עצירה במסע
    trailStops.forEach((stop, idx) => {
      if (!stop.isoDate) return;
      const cleanDate = stop.isoDate.replace(/-/g, '');
      const cleanNext = nextDateClean(stop.isoDate);
      events.push([
        'BEGIN:VEVENT',
        `UID:bakshu_stop_${idx}_${cleanDate}@bakshu.vibe`,
        `DTSTAMP:${dtStamp}`,
        `SUMMARY:${escapeIcsText(`🎯 ${stop.title || 'עצירה במסע - ישיבת בקשו'}`)}`,
        `DESCRIPTION:${escapeIcsText(stop.description || 'תחנת עצירה במסע עד הפסגה - ישיבת בקשו')}`,
        `DTSTART;VALUE=DATE:${cleanDate}`,
        `DTEND;VALUE=DATE:${cleanNext}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`תזכורת: ${stop.title || 'תחנת עצירה במבצע בקשו'}`)}`,
        'TRIGGER:PT9H',
        'END:VALARM',
        'END:VEVENT'
      ].join('\r\n'));
    });

    // 2. מעבר על כל ימי המבצע: אירועים מיוחדים, תורנויות עם תזכורות, וסדרי לימוד עם תזכורות
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

    const wakeRemMins = computeReminderMinutesBefore(dCfg.duty1Hour, dCfg.duty1ReminderHour, true);
    const kitchRemMins = computeReminderMinutesBefore(dCfg.duty2Hour, dCfg.duty2ReminderHour, false);

    while (cur <= end) {
      const iso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
      const dateClean = iso.replace(/-/g, '');
      const nextClean = nextDateClean(iso);
      const daySlots = slotsByDate[iso] !== undefined ? slotsByDate[iso] : getDefaultSlotsForIsoDate(iso);
      const duty = dutiesByDate[iso];

      // 2א. אירוע מיוחד באותו יום
      if (duty?.specialEventTitle) {
        events.push([
          'BEGIN:VEVENT',
          `UID:bakshu_ev_${dateClean}@bakshu.vibe`,
          `DTSTAMP:${dtStamp}`,
          `SUMMARY:${escapeIcsText(`🎉 ${duty.specialEventTitle} | ישיבת בקשו`)}`,
          `DESCRIPTION:${escapeIcsText(`אירוע מיוחד בלוח המבצע של ישיבת בקשו: ${duty.specialEventTitle}`)}`,
          `DTSTART;VALUE=DATE:${dateClean}`,
          `DTEND;VALUE=DATE:${nextClean}`,
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcsText(`🎉 היום בישיבה: ${duty.specialEventTitle}`)}`,
          'TRIGGER:PT8H30M',
          'END:VALARM',
          'END:VEVENT'
        ].join('\r\n'));
      }

      // 2ב. תורנות 1 (מעורר בוקר) + תזכורות
      if (duty?.wakeupStudentId) {
        const wName = userMap[duty.wakeupStudentId] || 'תורן';
        const includeWake = isAdmin || (studentId && String(studentId) === duty.wakeupStudentId);
        if (includeWake) {
          const wStart = formatTimeHHMMSS(dCfg.duty1Hour, '06:30');
          const wEnd = addOneHourHHMMSS(dCfg.duty1Hour, '06:30');
          const summary = isAdmin
            ? `🌅 ${dCfg.duty1Name}: ${wName}`
            : `⏰ תורנות שלי: ${dCfg.duty1Name} (+3 נק׳)`;
          const desc = isAdmin
            ? `תורן משובץ ל${dCfg.duty1Name}: ${wName}`
            : `הינך משובץ לתורנות ${dCfg.duty1Name} בישיבת בקשו. לא לשכוח לסמן ביצוע בפורטל!`;

          events.push([
            'BEGIN:VEVENT',
            `UID:bakshu_wake_${dateClean}_${isAdmin ? 'admin' : duty.wakeupStudentId}@bakshu.vibe`,
            `DTSTAMP:${dtStamp}`,
            `SUMMARY:${escapeIcsText(summary)}`,
            `DESCRIPTION:${escapeIcsText(desc)}`,
            `DTSTART;TZID=Asia/Jerusalem:${dateClean}T${wStart}`,
            `DTEND;TZID=Asia/Jerusalem:${dateClean}T${wEnd}`,
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeIcsText(`תזכורת ערב לתורנות מחר בבוקר: ${summary}`)}`,
            `TRIGGER:-PT${wakeRemMins}M`,
            'END:VALARM',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeIcsText(`תזכורת: ${summary} מתחיל בעוד 15 דקות!`)}`,
            'TRIGGER:-PT15M',
            'END:VALARM',
            'END:VEVENT'
          ].join('\r\n'));
        }
      }

      // 2ג. תורנות 2 (תורן מטבח) + תזכורות
      if (duty?.kitchenStudentId) {
        const kName = userMap[duty.kitchenStudentId] || 'תורן';
        const includeKitchen = isAdmin || (studentId && String(studentId) === duty.kitchenStudentId);
        if (includeKitchen) {
          const kStart = formatTimeHHMMSS(dCfg.duty2Hour, '12:00');
          const kEnd = addOneHourHHMMSS(dCfg.duty2Hour, '12:00');
          const summary = isAdmin
            ? `🍽️ ${dCfg.duty2Name}: ${kName}`
            : `🍽️ תורנות שלי: ${dCfg.duty2Name} (+3 נק׳)`;
          const desc = isAdmin
            ? `תורן משובץ ל${dCfg.duty2Name}: ${kName}`
            : `הינך משובץ לתורנות ${dCfg.duty2Name} בישיבת בקשו. לא לשכוח לסמן ביצוע בפורטל!`;

          events.push([
            'BEGIN:VEVENT',
            `UID:bakshu_kitch_${dateClean}_${isAdmin ? 'admin' : duty.kitchenStudentId}@bakshu.vibe`,
            `DTSTAMP:${dtStamp}`,
            `SUMMARY:${escapeIcsText(summary)}`,
            `DESCRIPTION:${escapeIcsText(desc)}`,
            `DTSTART;TZID=Asia/Jerusalem:${dateClean}T${kStart}`,
            `DTEND;TZID=Asia/Jerusalem:${dateClean}T${kEnd}`,
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeIcsText(`תזכורת לתורנות היום: ${summary}`)}`,
            `TRIGGER:-PT${kitchRemMins}M`,
            'END:VALARM',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeIcsText(`תזכורת: ${summary} מתחיל בעוד 15 דקות!`)}`,
            'TRIGGER:-PT15M',
            'END:VALARM',
            'END:VEVENT'
          ].join('\r\n'));
        }
      }

      // 2ד. סדרי הלימוד היומיים + תזכורות פתיחת סדר וסימון נוכחות
      daySlots.forEach((sl, sIdx) => {
        const openClean = formatTimeHHMMSS(sl.openTime, '09:00');
        const lockClean = formatTimeHHMMSS(sl.lockTime, '12:00');
        const pts = Number(sl.points) || 1;
        const summary = `📖 ${sl.title} (${pts} נק׳)`;
        const desc = isAdmin
          ? `סדר לימוד בישיבת בקשו: ${sl.title} (${sl.openTime} - ${sl.lockTime}) • שווי: ${pts} נקודות`
          : `סדר לימוד במבצע 'עד הפסגה': ${sl.title} (${sl.openTime} - ${sl.lockTime}). זכור להפקיד טלפון (+1 נק׳) ולאשר נוכחות בפורטל!`;

        events.push([
          'BEGIN:VEVENT',
          `UID:bakshu_slot_${dateClean}_${sIdx}@bakshu.vibe`,
          `DTSTAMP:${dtStamp}`,
          `SUMMARY:${escapeIcsText(summary)}`,
          `DESCRIPTION:${escapeIcsText(desc)}`,
          `DTSTART;TZID=Asia/Jerusalem:${dateClean}T${openClean}`,
          `DTEND;TZID=Asia/Jerusalem:${dateClean}T${lockClean}`,
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcsText(`⏰ תזכורת: ${sl.title} נפתח בעוד 10 דקות! זכור לסמן נוכחות ולהפקיד טלפון 📵`)}`,
          'TRIGGER:-PT10M',
          'END:VALARM',
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcsText(`✅ ${sl.title} נפתח כעת! לחץ לאישור נוכחות במערכת בקשו VIBE`)}`,
          'TRIGGER:PT0M',
          'END:VALARM',
          'END:VEVENT'
        ].join('\r\n'));
      });

      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bakshu VIBE//Dynamic Google Calendar Feed//HE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcsText(calName)}`,
      'X-WR-TIMEZONE:Asia/Jerusalem',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Jerusalem',
      'BEGIN:STANDARD',
      'DTSTART:20261025T020000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0200',
      'TZNAME:IST',
      'END:STANDARD',
      'END:VTIMEZONE',
      events.join('\r\n'),
      'END:VCALENDAR'
    ];

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(icsLines.join('\r\n'));
  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).send('Error generating dynamic calendar feed');
  }
}
