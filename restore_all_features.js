const fs = require('fs');
const cp = require('child_process');

console.log('=== STARTING RESTORE_ALL_FEATURES ===');

let html = fs.readFileSync('index.html', 'utf8');

// ---------------------------------------------------------
// 1. Grid ID for Visual Calendar: adminVisualCalendarGrid & Day Picker
// ---------------------------------------------------------
if (html.includes('id="adminInteractiveCalendarGrid"')) {
  html = html.replace('id="adminInteractiveCalendarGrid"', 'id="adminVisualCalendarGrid"');
  console.log('✓ 1a. Renamed grid ID to adminVisualCalendarGrid in HTML');
}
if (html.includes("document.getElementById('adminInteractiveCalendarGrid')")) {
  html = html.replace(
    "document.getElementById('adminInteractiveCalendarGrid')",
    "(document.getElementById('adminVisualCalendarGrid') || document.getElementById('adminInteractiveCalendarGrid'))"
  );
  console.log('✓ 1b. Updated JS to target adminVisualCalendarGrid');
}

// ---------------------------------------------------------
// 2. Separate Personal Target Tiers from Trail Stop Dates in adminView-campaign
// ---------------------------------------------------------
const newCampaignTiersBlock = `        <!-- Card A: 🎁 ניהול יעדים אישיים נושאי מתנה (רף נקודות אישי: יעד 1, יעד 2, הפסגה) -->
        <div class="soft-card p-5 sm:p-6 mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-black text-slate-900">🎁 ניהול יעדים אישיים נושאי מתנה</h3>
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200">רף נקודות אישי בלבד</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">קביעת שמות 3 יעדי הפרס ורף הנקודות האישי המזכה כל בחור בפרס (ללא תלות בתאריכים)</p>
            </div>
            <span id="adminTotalAchievablePointsBadge" class="text-xs font-black px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
              📊 קופת נקודות הסדרים: -- נק׳
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <!-- Tier 1: Bronze Target -->
            <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-amber-950">🥉 יעד 1 (כניסה להגרלה)</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">ארד</span>
              </div>
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">שם היעד בתצוגה:</label>
              <input type="text" id="targetMinNameInput" value="יעד כניסה להגרלה" class="w-full text-xs font-bold p-2.5 rounded-xl border border-amber-300 bg-white mb-2" oninput="updateCampaignTotalPointsLive()" />
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">רף נקודות אישי נדרש:</label>
              <input type="number" id="targetMinPointsInput" value="70" class="w-full text-sm font-black p-2.5 rounded-xl border border-amber-300 bg-white" oninput="updateCampaignTotalPointsLive()" />
            </div>

            <!-- Tier 2: Silver Target -->
            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-300 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-slate-900">🥈 יעד 2 (פרס כספי)</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">כסף</span>
              </div>
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">שם היעד בתצוגה:</label>
              <input type="text" id="targetMidNameInput" value="יעד פרס כספי" class="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 bg-white mb-2" oninput="updateCampaignTotalPointsLive()" />
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">רף נקודות אישי נדרש:</label>
              <input type="number" id="targetMidPointsInput" value="100" class="w-full text-sm font-black p-2.5 rounded-xl border border-slate-300 bg-white" oninput="updateCampaignTotalPointsLive()" />
            </div>

            <!-- Tier 3: Gold Summit Target -->
            <div class="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-indigo-950">🥇 יעד 3 (הפסגה - פרס ענק)</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900">זהב</span>
              </div>
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">שם היעד בתצוגה:</label>
              <input type="text" id="targetMaxNameInput" value="יעד נסיעה ופרס ענק" class="w-full text-xs font-bold p-2.5 rounded-xl border border-indigo-300 bg-white mb-2" oninput="updateCampaignTotalPointsLive()" />
              <label class="block text-[10px] font-bold text-slate-500 mb-0.5">רף נקודות אישי נדרש:</label>
              <input type="number" id="targetMaxPointsInput" value="130" class="w-full text-sm font-black p-2.5 rounded-xl border border-indigo-300 bg-white" oninput="updateCampaignTotalPointsLive()" />
            </div>
          </div>
        </div>

        <!-- Card B: 🏔️ ניהול תחנות העצירה במסע (תאריכים בלוח השנה + סנכרון Google Calendar) -->
        <div class="soft-card p-5 sm:p-6 mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-black text-slate-900">🏔️ ניהול תחנות העצירה במסע (תאריכים וסנכרון לוח שנה)</h3>
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200">אירועים ביומן</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">שיבוץ תאריכי העצירות בלוח השנה של המבצע וסנכרון ל-Google Calendar של הבחורים (ללא תלות בנקודות)</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <!-- Stop 1 -->
            <div class="p-4 rounded-2xl bg-amber-50/50 border border-amber-300/80 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-amber-950">📍 עצירה 1 – פיתחו יומנים!</span>
                <button onclick="openGoogleCalendarForStop(0)" class="text-[10px] font-bold text-blue-700 hover:underline">📅 סנכרן</button>
              </div>
              <label class="block text-[10px] font-bold text-slate-600 mb-1">תאריך העצירה בלוח המבצע:</label>
              <select id="adminStop1DateSelect" class="w-full text-xs font-bold p-2.5 rounded-xl border border-amber-300 bg-white mb-1.5" onchange="onStopDateSelectChange(0, this.value)">
                <!-- populated by JS -->
              </select>
              <div class="text-[11px] text-amber-900 font-bold bg-white/80 p-2 rounded-xl border border-amber-200" id="stop1DateLabelDisplay">--</div>
            </div>

            <!-- Stop 2 -->
            <div class="p-4 rounded-2xl bg-slate-50 border border-slate-300 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-slate-900">🎁 עצירה 2 – יעד נושא מתנה!</span>
                <button onclick="openGoogleCalendarForStop(1)" class="text-[10px] font-bold text-blue-700 hover:underline">📅 סנכרן</button>
              </div>
              <label class="block text-[10px] font-bold text-slate-600 mb-1">תאריך העצירה בלוח המבצע:</label>
              <select id="adminStop2DateSelect" class="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 bg-white mb-1.5" onchange="onStopDateSelectChange(1, this.value)">
                <!-- populated by JS -->
              </select>
              <div class="text-[11px] text-slate-800 font-bold bg-white/80 p-2 rounded-xl border border-slate-200" id="stop2DateLabelDisplay">--</div>
            </div>

            <!-- Stop 3: Summit -->
            <div class="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-300/80 shadow-2xs">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-indigo-950">🏔️ הפסגה – המטרה הגדולה!</span>
                <button onclick="openGoogleCalendarForStop(2)" class="text-[10px] font-bold text-blue-700 hover:underline">📅 סנכרן</button>
              </div>
              <label class="block text-[10px] font-bold text-slate-600 mb-1">תאריך אירוע הפסגה בלוח:</label>
              <select id="adminStop3DateSelect" class="w-full text-xs font-bold p-2.5 rounded-xl border border-indigo-300 bg-white mb-1.5" onchange="onStopDateSelectChange(2, this.value)">
                <!-- populated by JS -->
              </select>
              <div class="text-[11px] text-indigo-900 font-bold bg-white/80 p-2 rounded-xl border border-indigo-200" id="stop3DateLabelDisplay">--</div>
            </div>
          </div>
        </div>

        <!-- Card C: Campaign Dates & Bonus Rules -->
        <div class="soft-card p-5 sm:p-6" id="adminSubView-rules">
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h3 class="text-base font-black text-slate-900">⚙️ הגדרות תאריכי המבצע ובונוס קבוצתי</h3>
              <p class="text-xs text-slate-500">קביעת מועד פתיחה, נעילה, בונוס סדר מלא ובונוס התמדה</p>
            </div>
          </div>`;

if (html.includes('<!-- 3 Tiers & Dates Configuration Form -->')) {
  const parts = html.split('<!-- 3 Tiers & Dates Configuration Form -->');
  const rest = parts[1].split('<!-- Campaign Dates & Full Seder Rule -->');
  html = parts[0] + newCampaignTiersBlock + '\n          </div>\n\n          <!-- Campaign Dates & Full Seder Rule -->' + rest[1];
  console.log('✓ 2. Separated Personal Target Tiers from Trail Stop Dates in adminView-campaign');
}

// ---------------------------------------------------------
// 3. Top Card in #adminView-duties: Rotation Tracking & Raffle Buttons
// ---------------------------------------------------------
const dutiesTopCardHtml = `        <!-- Top Card: מעקב סבב תורנים והגרלה הוגנת -->
        <div class="soft-card p-4 sm:p-6 mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-black text-slate-900">📊 מעקב סבב תורנים והגרלה הוגנת</h3>
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300" id="adminDutiesStatsBadge">0 תורנויות</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">מעקב חלוקת תורנויות שוויונית בין כל בחורי הישיבה (השכמת בוקר 22:30 / ניקיון מטבח 19:30)</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="raffleFairDutiesAllDays()" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white font-black text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer">
                <span>🎲</span>
                <span>הגרל תורנים לכל הימים הפנויים</span>
              </button>
              <button onclick="raffleFairDutyForSelectedDate()" class="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs transition border border-slate-200 flex items-center gap-1.5 cursor-pointer">
                <span>🎲</span>
                <span>הגרל תורן ליום הנבחר</span>
              </button>
            </div>
          </div>

          <!-- Two Columns: Completed vs Next in Line -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Col 1: מי כבר היה תורן ומתי -->
            <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                <span class="text-xs font-black text-emerald-950 flex items-center gap-1">
                  <span>✅</span>
                  <span>מי כבר היה תורן (ומתי)</span>
                </span>
                <span class="text-[10px] text-slate-400 font-mono" id="dutyPastCountBadge">0 בחורים</span>
              </div>
              <div id="dutyPastListContainer" class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 text-xs">
                <!-- Rendered dynamically -->
              </div>
            </div>

            <!-- Col 2: מי הבאים בתור / טרם שובצו -->
            <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                <span class="text-xs font-black text-indigo-950 flex items-center gap-1">
                  <span>⏭️</span>
                  <span>מי הבאים בתור / טרם שובצו</span>
                </span>
                <span class="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md" id="dutyNextCountBadge">0 בחורים</span>
              </div>
              <div id="dutyNextListContainer" class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 text-xs">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>
        </div>\n`;

if (!html.includes('id="dutyPastListContainer"')) {
  html = html.replace(
    '<div id="adminView-duties" class="admin-subview hidden space-y-4">',
    '<div id="adminView-duties" class="admin-subview hidden space-y-4">\n' + dutiesTopCardHtml
  );
  console.log('✓ 3. Upgraded #adminView-duties with rotation tracking cards and raffle buttons');
}

// ---------------------------------------------------------
// 4. Modal in HTML: #adminStudentBreakdownModal
// ---------------------------------------------------------
const studentBreakdownModalHtml = `
  <!-- Detailed Admin Student Inspection Modal -->
  <div id="adminStudentBreakdownModal" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 hidden">
    <div class="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 text-right max-h-[90vh] overflow-y-auto">
      <div id="adminStudentBreakdownModalContent">
        <!-- Rendered dynamically by inspectStudentFromAdmin -->
      </div>
    </div>
  </div>`;

if (!html.includes('id="adminStudentBreakdownModal"')) {
  html = html.replace('</body>', studentBreakdownModalHtml + '\n</body>');
  console.log('✓ 4. Inserted #adminStudentBreakdownModal into HTML');
}

// ---------------------------------------------------------
// 5. Upgrade renderAdminDayScheduleEditor with Slot Attendance Accordion
// ---------------------------------------------------------
const targetSlotAccordionCode = `      const slotsHtml = slots.map((slot, idx) => {
        let presentCount = 0;
        let phoneFreeCount = 0;
        studentsList.forEach(st => {
          if (isStudentPresentInSlot(st.id, slot, selectedDate)) presentCount++;
          if (isStudentPhoneFreeInSlot(st.id, slot, selectedDate)) phoneFreeCount++;
        });

        const studentsAttendanceListHtml = studentsList.map(st => {
          const isPresent = isStudentPresentInSlot(st.id, slot, selectedDate);
          const isPf = isStudentPhoneFreeInSlot(st.id, slot, selectedDate);
          return \`
            <div class="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900">\${st.name}</span>
                <span class="text-[10px] text-slate-400 font-mono" dir="ltr">\${st.phone || ''}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="adminToggleSlotStudentAttendance('\${selectedDate}', \${idx}, '\${st.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition border \${isPresent ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'}">
                  \${isPresent ? '✓ נכח (+' + (slot.points || 1) + ')' : 'סמן נוכחות'}
                </button>
                <button onclick="adminToggleSlotStudentPhoneFree('\${selectedDate}', \${idx}, '\${st.id}')" class="px-2 py-1 rounded-lg text-xs font-bold transition border \${isPf ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}" title="סימון לימוד ללא טלפון">
                  \${isPf ? '📵 ללא טלפון (+1)' : '📵 רגיל'}
                </button>
              </div>
            </div>
          \`;
        }).join('');

        return \`
          <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex-1 min-w-[200px]">
                <input type="text" value="\${slot.title}" onchange="updateSlotTitle('\${selectedDate}', \${idx}, this.value)" class="text-sm font-black text-slate-900 w-full p-1 border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none" />
                <div class="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span>פתיחה:</span>
                  <input type="time" value="\${slot.openTime}" onchange="updateSlotTime('\${selectedDate}', \${idx}, 'openTime', this.value)" class="font-mono font-bold p-1 rounded-lg border border-slate-200 text-xs" />
                  <span>נעילה:</span>
                  <input type="time" value="\${slot.lockTime}" onchange="updateSlotTime('\${selectedDate}', \${idx}, 'lockTime', this.value)" class="font-mono font-bold p-1 rounded-lg border border-slate-200 text-xs" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs font-bold text-slate-500">שווי:</label>
                <select onchange="updateSlotPoints('\${selectedDate}', \${idx}, this.value)" class="text-xs font-black p-1.5 rounded-xl border border-slate-200 bg-amber-50 text-amber-900">
                  <option value="1" \${slot.points === 1 ? 'selected' : ''}>1 נק׳</option>
                  <option value="2" \${slot.points === 2 ? 'selected' : ''}>2 נק׳</option>
                  <option value="3" \${slot.points === 3 ? 'selected' : ''}>3 נק׳</option>
                  <option value="5" \${slot.points === 5 ? 'selected' : ''}>5 נק׳ (משמר)</option>
                  <option value="8" \${slot.points === 8 ? 'selected' : ''}>8 נק׳ (שבת)</option>
                </select>
                <button onclick="removeSlotItem('\${selectedDate}', \${idx})" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold" title="מחק סדר זה">
                  ✕
                </button>
              </div>
            </div>

            <!-- Accordion: מי נכח בסדר ומי סימן ללא טלפון -->
            <details class="rounded-xl border border-indigo-100 bg-indigo-50/30 overflow-hidden text-xs">
              <summary class="p-2.5 font-bold text-indigo-950 cursor-pointer hover:bg-indigo-50 flex items-center justify-between select-none">
                <span class="flex items-center gap-1.5">
                  <span>👥 צפייה וסימון: מי נכח בסדר ומי סימן ללא טלפון 📵</span>
                </span>
                <span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                  \${presentCount} נכחו • \${phoneFreeCount} ללא טלפון
                </span>
              </summary>
              <div class="p-2.5 space-y-1.5 bg-slate-50/70 border-t border-indigo-100 max-h-60 overflow-y-auto">
                \${studentsAttendanceListHtml}
              </div>
            </details>
          </div>
        \`;
      }).join('');\n\n      `;

const tokenStart = 'const slotsHtml = slots.map((slot, idx) =>';
const tokenEnd = 'container.innerHTML = slotsHtml + dutiesBlockHtml;';
if (html.includes(tokenStart) && html.includes(tokenEnd)) {
  const parts = html.split(tokenStart);
  const rest = parts[1].split(tokenEnd);
  html = parts[0] + targetSlotAccordionCode + tokenEnd + rest[1];
  console.log('✓ 5b. Upgraded renderAdminDayScheduleEditor with slot attendance & phone-free accordion');
}

// ---------------------------------------------------------
// 6. Real-time Status Pill & Daily Schedule Highlighting
// ---------------------------------------------------------
// Status pill synchronization
const oldSederTitleTimeBlock = `          if (titleEl) titleEl.textContent = prefix ? \`\${prefix}\${currentOrNext.title}\` : currentOrNext.title;
          const [oT, lT] = (currentOrNext.timeWindow || '09:00 - 10:15').split('-').map(x => x.trim());
          if (timeEl) timeEl.textContent = \`\${oT || '09:00'} - \${lT || '10:15'}\`;
          if (ptsEl) ptsEl.textContent = \`+\${currentOrNext.points || 1} נק׳\`;`;

const newSederTitleTimeBlock = `          if (titleEl) titleEl.textContent = prefix ? \`\${prefix}\${currentOrNext.title}\` : currentOrNext.title;
          const [oT, lT] = (currentOrNext.timeWindow || (currentOrNext.openTime + ' - ' + currentOrNext.lockTime) || '09:00 - 10:15').split('-').map(x => x.trim());
          if (timeEl) timeEl.textContent = \`\${oT || '09:00'} - \${lT || '10:15'}\`;
          if (ptsEl) ptsEl.textContent = \`+\${currentOrNext.points || 1} נק׳\`;

          const statusPill = document.getElementById('sederStatusPill') || document.getElementById('activeSederStatusBadge');
          if (statusPill) {
            const timeStatus = getSederTimeStatus(currentOrNext);
            if (timeStatus.active) {
              statusPill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm';
              statusPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span><span>פתוח לסימון כעת ✓</span>';
            } else {
              statusPill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200';
              statusPill.innerHTML = '<span>🔒 ' + timeStatus.msg + '</span>';
            }
          }`;

if (html.includes("if (titleEl) titleEl.textContent = prefix ? `${prefix}${currentOrNext.title}` : currentOrNext.title;") && !html.includes("const statusPill = document.getElementById('sederStatusPill')")) {
  const parts = html.split("if (titleEl) titleEl.textContent = prefix ? `${prefix}${currentOrNext.title}` : currentOrNext.title;");
  const rest = parts[1].split("if (ptsEl) ptsEl.textContent = `+${currentOrNext.points || 1} נק׳`;");
  html = parts[0] + newSederTitleTimeBlock + rest[1];
  console.log('✓ 6c-2. Added real-time status pill synchronization');
}

// Today slots highlight upgrade
if (html.includes("const isActive = (currentOrNext && currentOrNext.id === slot.id);")) {
  html = html.replace(
    "const isActive = (currentOrNext && currentOrNext.id === slot.id);",
    "const isActive = (currentOrNext && currentOrNext.id === slot.id) || (!currentOrNext && i === 0);"
  );
  console.log('✓ 6c-3. Upgraded daily schedule highlighting');
}

// ---------------------------------------------------------
// Write upgraded index.html
// ---------------------------------------------------------
fs.writeFileSync('index.html', html, 'utf8');
console.log('✓ index.html written successfully');

// ---------------------------------------------------------
// Sync to admin.html with direct password modal visible
// ---------------------------------------------------------
let adminHtml = html;
adminHtml = adminHtml.replace(
  '<div id="adminPasswordModal" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 hidden">',
  '<div id="adminPasswordModal" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">'
);
adminHtml = adminHtml.replace('id="dtab-admin" class="hidden dtab-btn', 'id="dtab-admin" class="dtab-btn');
adminHtml = adminHtml.replace('id="mtab-admin" class="hidden mtab-btn', 'id="mtab-admin" class="mtab-btn');

fs.writeFileSync('admin.html', adminHtml, 'utf8');
console.log('✓ admin.html written successfully');

// ---------------------------------------------------------
// Validate JavaScript Syntax in both files
// ---------------------------------------------------------
['index.html', 'admin.html'].forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const scripts = content.match(/<script[\s\S]*?<\/script>/gi) || [];
  scripts.forEach((s, idx) => {
    const code = s.replace(/<script[^>]*>|<\/script>/gi, '');
    try {
      new Function(code);
    } catch(err) {
      console.error('SYNTAX ERROR in ' + f + ' script ' + idx + ': ' + err.message);
      process.exit(1);
    }
  });
});
console.log('✓ ALL SCRIPTS 100% SYNTAX VALID!');

// ---------------------------------------------------------
// Git Add, Commit and Push
// ---------------------------------------------------------
try {
  console.log('Executing git add, commit, and push...');
  cp.execSync('git add index.html admin.html', { stdio: 'inherit' });
  const commitMsg = 'Complete all 7 features: slot accordion, status pill, fair duties raffle, separated targets & stops, modal breakdown';
  try {
    cp.execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
  } catch (ce) {
    console.log('No new changes to commit or commit returned:', ce.message);
  }
  cp.execSync('git push origin main', { stdio: 'inherit' });
  console.log('✓ GIT PUSH TO ORIGIN MAIN SUCCEEDED!');
} catch (gitErr) {
  console.error('Git error:', gitErr.message);
  process.exit(1);
}

console.log('=== RESTORE_ALL_FEATURES COMPLETE ===');
