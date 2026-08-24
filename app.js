/* ============================================================
   2026 대영중 교사밴드 — 연습 일정 공유 앱
   Firebase Realtime Database, SDK 없이 REST API 직접 fetch (학생회 앱과 동일 패턴)
   함수 단위 전체 교체 원칙 — 부분 패치 금지
   ============================================================ */

const ROLES = ['보컬','일렉1','일렉2','통기타','베이스','드럼','피아노','신디','트럼펫'];
const WEEKDAYS = ['월','화','수','목','금','토','일'];
const ROOM_ROWS = [
  '아침 7:30-8:30','1교시 9:00-9:45','2교시 9:55-10:40','3교시 10:50-11:35',
  '4교시 11:45-12:30','점심 12:30-1:20','5교시 1:20-2:05','6교시 2:15-3:00',
  '방과후 3:30-4:00','방과후 4:00-4:30','방과후 4:30-5:00','방과후 5:00-5:30',
  '방과후 5:30-6:00','방과후 6:00-7:00','방과후 7:00-8:00'
];
const CAL_TYPE_LABEL = { holiday:'휴일', exam:'시험', discretionary:'재량', club:'동아리' };

// ---------------- REST 헬퍼 ----------------
async function dbGet(path){
  const res = await fetch(`${DB_URL}/${path}.json`);
  if(!res.ok) throw new Error('dbGet failed: ' + path);
  return res.json();
}
async function dbSet(path, value){
  const res = await fetch(`${DB_URL}/${path}.json`, { method:'PUT', body: JSON.stringify(value) });
  if(!res.ok) throw new Error('dbSet failed: ' + path);
  return res.json();
}
async function dbPatch(path, value){
  const res = await fetch(`${DB_URL}/${path}.json`, { method:'PATCH', body: JSON.stringify(value) });
  if(!res.ok) throw new Error('dbPatch failed: ' + path);
  return res.json();
}
async function dbPush(path, value){
  const res = await fetch(`${DB_URL}/${path}.json`, { method:'POST', body: JSON.stringify(value) });
  if(!res.ok) throw new Error('dbPush failed: ' + path);
  return res.json(); // { name: "-Nxxxxx" }
}
async function dbRemove(path){
  const res = await fetch(`${DB_URL}/${path}.json`, { method:'DELETE' });
  if(!res.ok) throw new Error('dbRemove failed: ' + path);
  return res.json();
}

// ---------------- 전역 상태 ----------------
const STATE = { members:{}, songs:{}, events:{}, roomSchedule:{}, schoolCalendar:{}, loaded:false };

async function loadAll(){
  const [members, songs, events, roomSchedule, schoolCalendar] = await Promise.all([
    dbGet('members'), dbGet('songs'), dbGet('events'), dbGet('roomSchedule'), dbGet('schoolCalendar')
  ]);
  STATE.members = members || {};
  STATE.songs = songs || {};
  STATE.events = events || {};
  STATE.roomSchedule = roomSchedule || {};
  STATE.schoolCalendar = schoolCalendar || {};
  STATE.loaded = true;
}

// ---------------- 유틸 ----------------
function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function toISO(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayISO(){ return toISO(new Date()); }
function fromISO(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); }
function formatDateLabel(iso){
  const d = fromISO(iso);
  return `${d.getMonth()+1}/${d.getDate()} (${WEEKDAYS[(d.getDay()+6)%7]})`;
}
function toast(msg){
  const root = document.getElementById('toastRoot');
  root.innerHTML = ''; // 이전 토스트가 남아있으면 겹쳐 보이므로 먼저 비움
  const el = document.createElement('div');
  el.className='toast'; el.textContent=msg;
  root.appendChild(el);
  setTimeout(()=>{ if(el.parentNode) el.remove(); }, 2200);
}
function eventsSorted(){
  return Object.entries(STATE.events).sort((a,b)=> a[1].date < b[1].date ? -1 : a[1].date > b[1].date ? 1 : 0);
}

// ---------------- 신원(이름 선택) ----------------
function getIdentity(){ return localStorage.getItem('bp_name') || ''; }
function setIdentity(name){ localStorage.setItem('bp_name', name); renderIdentityChip(); }
function renderIdentityChip(){
  const name = getIdentity();
  document.getElementById('identityName').textContent = name || '이름 선택';
  document.getElementById('identityAvatar').textContent = name ? name[0] : '?';
}
function openIdentityModal(){
  const names = Object.keys(STATE.members).sort();
  showModal(`
    <div class="modal-title">본인 이름을 선택해줘</div>
    <div class="section-sub">이후 참석 체크할 때 이 이름으로 기록돼. 다른 사람 걸로 바꾸고 싶으면 이 화면에서 언제든 다시 선택하면 돼.</div>
    <div class="name-grid">
      ${names.map(n => `<button type="button" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}
    </div>
  `);
  document.querySelectorAll('.name-grid button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setIdentity(btn.dataset.name);
      closeModal();
      toast(`${btn.dataset.name}님으로 설정됨`);
      render();
    });
  });
}

// ---------------- 관리자 ----------------
async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function isAdmin(){ return localStorage.getItem('bp_admin') === 'true'; }
function logoutAdmin(){
  localStorage.removeItem('bp_admin');
  toast('관리자 모드 해제됨');
  render();
}
function openAdminPrompt(){
  showModal(`
    <div class="modal-title">관리자 인증</div>
    <div class="field"><input type="password" id="adminKeyInput" placeholder="관리자 키 입력"></div>
    <button class="btn btn-primary btn-block" id="adminSubmit">확인</button>
  `);
  document.getElementById('adminSubmit').addEventListener('click', async ()=>{
    const v = document.getElementById('adminKeyInput').value;
    const hash = await sha256Hex(v);
    if(hash === ADMIN_KEY_HASH){
      localStorage.setItem('bp_admin','true');
      closeModal(); toast('관리자로 전환됨'); render();
    } else {
      toast('키가 맞지 않아');
    }
  });
}
// 관리자 배지 — 모든 뷰에서 공통으로 쓰는 로그인/로그아웃 토글 버튼
function adminBadgeHtml(){
  return isAdmin()
    ? `<button class="btn btn-ghost btn-sm" id="adminBtn">🔓 로그아웃</button>`
    : `<button class="btn btn-ghost btn-sm" id="adminBtn">🔒 관리자</button>`;
}
function bindAdminBadge(){
  const btn = document.getElementById('adminBtn');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    if(isAdmin()){
      if(confirm('관리자 모드를 해제할까?')) logoutAdmin();
    } else {
      openAdminPrompt();
    }
  });
}

// ---------------- 모달 ----------------
function showModal(innerHtml){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal-sheet">${innerHtml}</div></div>`;
  document.getElementById('modalBackdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'modalBackdrop') closeModal();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }

// ---------------- 라우터 ----------------
const ROUTES = {
  home: renderHome,
  calendar: renderCalendar,
  schedule: renderSchedule,
  reference: renderReference,
  members: renderMembers,
  sync: renderSync
};

function currentRoute(){
  return (location.hash.replace('#','') || 'home');
}
function navigate(route){ location.hash = route; }

function render(){
  const route = currentRoute();
  document.querySelectorAll('.bottom-nav button').forEach(b=>{
    b.classList.toggle('active', b.dataset.route === route);
  });
  const fab = document.getElementById('fab');
  fab.style.display = (route === 'schedule' && isAdmin()) ? 'flex' : 'none';
  const fn = ROUTES[route] || renderHome;
  fn();
}

// ================================================================
// 홈
// ================================================================
function renderHome(){
  const view = document.getElementById('view');
  const today = todayISO();
  const upcoming = eventsSorted().filter(([,e]) => e.date >= today).slice(0,5);
  const me = getIdentity();

  view.innerHTML = `
    <div class="section-title">가까운 연습</div>
    <div class="section-sub">오늘(${formatDateLabel(today)}) 기준으로 가까운 순</div>
    ${upcoming.length === 0 ? `<div class="empty-state">예정된 연습이 없어. 일정관리에서 추가해줘.</div>` : ''}
    <div id="homeList"></div>
  `;
  const list = document.getElementById('homeList');
  upcoming.forEach(([id, e]) => list.appendChild(eventCard(id, e, me)));
}

// ================================================================
// 이벤트 카드 (공용 컴포넌트 — 홈/일정관리/달력 상세에서 재사용)
// ================================================================
function eventCard(id, e, me){
  const song = STATE.songs[e.songId];
  const color = song ? song.color : '#999';
  const wrap = document.createElement('div');
  wrap.className = 'setlist-card';
  wrap.style.setProperty('--song-color', color);

  const roleChips = (e.participants||[]).map(p => {
    const a = (e.absence||{})[p.name];
    const isMe = p.name === me;
    const absentCls = a && a.absent ? 'absent' : '';
    return `<div class="role-chip ${isMe?'me':''} ${absentCls}">
      ${p.role ? `<span class="role-label">${escapeHtml(p.role)}</span>` : ''}
      ${escapeHtml(p.name)}
    </div>`;
  }).join('');

  const myAttendance = (e.absence||{})[me];
  const canCheckIn = me && (e.participants||[]).some(p=>p.name===me);

  wrap.innerHTML = `
    <div class="stripe"></div>
    <div class="date-badge">${formatDateLabel(e.date)}
      <span class="status-pill ${e.status==='완료'?'done':'upcoming'}">${escapeHtml(e.status||'예정')}</span>
    </div>
    <div class="song-title">${escapeHtml(e.songId)}</div>
    <div class="role-grid">${roleChips || '<span class="section-sub">참여자 정보 없음</span>'}</div>
    ${e.note ? `<div class="note-line">${escapeHtml(e.note)}</div>` : ''}
    ${canCheckIn ? `
      <div class="attend-toggle">
        <button type="button" class="attend-btn attend ${myAttendance && !myAttendance.absent ? 'selected':''}" data-act="attend">참석</button>
        <button type="button" class="attend-btn absent ${myAttendance && myAttendance.absent ? 'selected':''}" data-act="absent">불참</button>
        <input type="text" class="reason-input" placeholder="불참 사유(선택)" value="${escapeHtml(myAttendance?myAttendance.reason:'')}" ${myAttendance && myAttendance.absent ? '' : 'style="display:none"'}>
      </div>
    ` : ''}
  `;

  if(canCheckIn){
    const reasonInput = wrap.querySelector('.reason-input');
    wrap.querySelector('[data-act="attend"]').addEventListener('click', async ()=>{
      await dbPatch(`events/${id}/absence/${encodeURIComponent(me)}`, { absent:false, reason:'' });
      STATE.events[id].absence[me] = { absent:false, reason:'' };
      toast('참석으로 표시됨'); render();
    });
    wrap.querySelector('[data-act="absent"]').addEventListener('click', async ()=>{
      reasonInput.style.display = '';
      const reason = reasonInput.value || '';
      await dbPatch(`events/${id}/absence/${encodeURIComponent(me)}`, { absent:true, reason });
      STATE.events[id].absence[me] = { absent:true, reason };
      toast('불참으로 표시됨'); render();
    });
    reasonInput.addEventListener('change', async ()=>{
      await dbPatch(`events/${id}/absence/${encodeURIComponent(me)}`, { absent:true, reason:reasonInput.value });
      STATE.events[id].absence[me] = { absent:true, reason:reasonInput.value };
    });
  }
  return wrap;
}

// ================================================================
// 달력
// ================================================================
let CAL_CURSOR = new Date(); // 현재 보고 있는 달

function getMonthMatrix(year, month){
  // month: 0-based. 월요일 시작, 토/일 제외 5일 그리드.
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay()+6)%7; // 월=0
  const gridStart = new Date(year, month, 1-startOffset);
  const weeks = [];
  let cursor = new Date(gridStart);
  for(let w=0; w<6; w++){
    const week = [];
    for(let d=0; d<5; d++){
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate()+1);
    }
    cursor.setDate(cursor.getDate()+2); // 토, 일 건너뛰기
    weeks.push(week);
  }
  return weeks;
}

function renderCalendar(){
  const view = document.getElementById('view');
  const admin = isAdmin();
  const year = CAL_CURSOR.getFullYear(), month = CAL_CURSOR.getMonth();
  const weeks = getMonthMatrix(year, month);
  const today = todayISO();

  const eventsByDate = {};
  Object.entries(STATE.events).forEach(([id,e])=>{
    (eventsByDate[e.date] = eventsByDate[e.date] || []).push({id, ...e});
  });

  view.innerHTML = `
    <div class="section-title">달력 ${adminBadgeHtml()}</div>
    <div class="month-nav">
      <button type="button" id="prevMonth">‹</button>
      <div class="month-label">${year}년 ${month+1}월</div>
      <button type="button" id="nextMonth">›</button>
    </div>
    <div class="cal-grid" id="calGrid">
      ${WEEKDAYS.slice(0,5).map(w=>`<div class="cal-weekday">${w}</div>`).join('')}
    </div>
    <div class="legend" id="calLegend"></div>
  `;
  bindAdminBadge();
  const grid = document.getElementById('calGrid');
  weeks.forEach(week=>{
    week.forEach(d=>{
      const iso = toISO(d);
      const inMonth = d.getMonth() === month;
      const dayEvents = eventsByDate[iso] || [];
      const school = STATE.schoolCalendar[iso];
      const cell = document.createElement('div');
      cell.className = `cal-day ${inMonth?'':'other-month'} ${iso===today?'today':''}`;
      cell.innerHTML = `
        <div class="daynum">${d.getDate()}</div>
        <div class="cal-day-dots">${dayEvents.map(e=>{
          const song = STATE.songs[e.songId];
          return `<span class="cal-dot" style="background:${song?song.color:'#999'}"></span>`;
        }).join('')}</div>
        ${school ? `<div class="tag">${escapeHtml(school.label)}</div>` : ''}
      `;
      cell.addEventListener('click', ()=> openDayDetail(iso, dayEvents, school));
      grid.appendChild(cell);
    });
  });

  const legend = document.getElementById('calLegend');
  Object.values(STATE.songs).forEach(s=>{
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.title)}`;
    legend.appendChild(item);
  });

  document.getElementById('prevMonth').addEventListener('click', ()=>{
    CAL_CURSOR = new Date(year, month-1, 1); renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', ()=>{
    CAL_CURSOR = new Date(year, month+1, 1); renderCalendar();
  });
}

function openDayDetail(iso, dayEvents, school){
  const me = getIdentity();
  showModal(`
    <div class="modal-title">${formatDateLabel(iso)}</div>
    <div id="schoolCalBox"></div>
    <div id="dayDetailList" style="margin-top:12px;"></div>
    ${dayEvents.length===0 ? '<div class="empty-state">이 날은 예정된 연습이 없어</div>' : ''}
  `);

  function renderSchoolCalBox(){
    const box = document.getElementById('schoolCalBox');
    const cur = STATE.schoolCalendar[iso];
    if(cur){
      box.innerHTML = `
        <div class="school-cal-row">
          <span class="note-line" style="margin:0; flex:1;">${escapeHtml(CAL_TYPE_LABEL[cur.type]||'학사일정')}: ${escapeHtml(cur.label)}</span>
          <button class="btn btn-danger btn-sm" id="schoolCalDel">삭제</button>
        </div>
      `;
      document.getElementById('schoolCalDel').addEventListener('click', async ()=>{
        await dbRemove(`schoolCalendar/${iso}`);
        delete STATE.schoolCalendar[iso];
        renderSchoolCalBox();
        renderCalendar();
      });
    } else {
      box.innerHTML = `
        <div class="field">
          <label>학사일정 추가 (누구나 입력 가능)</label>
          <input type="text" id="schoolCalLabel" placeholder="예: 재량휴업일">
        </div>
        <div class="school-cal-row">
          <select id="schoolCalType">
            <option value="holiday">휴일</option>
            <option value="exam">시험</option>
            <option value="discretionary">재량</option>
            <option value="club">동아리</option>
          </select>
          <button class="btn btn-primary btn-sm" id="schoolCalAdd">추가</button>
        </div>
      `;
      document.getElementById('schoolCalAdd').addEventListener('click', async ()=>{
        const label = document.getElementById('schoolCalLabel').value.trim();
        if(!label){ toast('내용을 입력해줘'); return; }
        const type = document.getElementById('schoolCalType').value;
        const payload = { label, type };
        await dbSet(`schoolCalendar/${iso}`, payload);
        STATE.schoolCalendar[iso] = payload;
        renderSchoolCalBox();
        renderCalendar();
      });
    }
  }
  renderSchoolCalBox();

  const list = document.getElementById('dayDetailList');
  dayEvents.forEach(e => list.appendChild(eventCard(e.id, e, me)));
}

// ================================================================
// 일정관리 (관리자 CRUD)
// ================================================================
let SCHEDULE_MONTH_FILTER = 'all';

function renderSchedule(){
  const view = document.getElementById('view');
  const admin = isAdmin();

  const months = [...new Set(Object.values(STATE.events).map(e=>e.date.slice(0,7)))].sort().reverse();
  let list = Object.entries(STATE.events);
  if(SCHEDULE_MONTH_FILTER !== 'all'){
    list = list.filter(([,e]) => e.date.slice(0,7) === SCHEDULE_MONTH_FILTER);
  }
  list.sort((a,b) => b[1].date.localeCompare(a[1].date)); // 최신순(내림차순)

  view.innerHTML = `
    <div class="section-title">일정 관리 ${adminBadgeHtml()}</div>
    ${admin ? '' : `<div class="admin-lock">일정 추가/삭제는 관리자만 가능해. 참석 체크는 홈/달력에서 본인 이름으로 바로 가능함.</div>`}
    <div class="pill-row" id="monthPills">
      <button type="button" class="filter-pill ${SCHEDULE_MONTH_FILTER==='all'?'active':''}" data-month="all">전체</button>
      ${months.map(m=>{
        const label = `${parseInt(m.slice(5,7),10)}월`;
        return `<button type="button" class="filter-pill ${SCHEDULE_MONTH_FILTER===m?'active':''}" data-month="${m}">${label}</button>`;
      }).join('')}
    </div>
    <div id="scheduleList"></div>
    ${list.length===0 ? '<div class="empty-state">해당 월에는 일정이 없어</div>' : ''}
  `;
  bindAdminBadge();
  document.querySelectorAll('#monthPills .filter-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{ SCHEDULE_MONTH_FILTER = btn.dataset.month; renderSchedule(); });
  });

  const me = getIdentity();
  const container = document.getElementById('scheduleList');
  list.forEach(([id, e])=>{
    const card = eventCard(id, e, me);
    if(admin){
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
      btnRow.innerHTML = `
        <button class="btn btn-ghost btn-sm" data-act="edit">수정</button>
        <button class="btn btn-danger btn-sm" data-act="del">삭제</button>
      `;
      btnRow.querySelector('[data-act="edit"]').addEventListener('click', ()=> openEventForm(id, e));
      btnRow.querySelector('[data-act="del"]').addEventListener('click', async ()=>{
        if(!confirm('이 일정을 삭제할까?')) return;
        await dbRemove(`events/${id}`);
        delete STATE.events[id];
        toast('삭제됨'); render();
      });
      card.appendChild(btnRow);
    }
    container.appendChild(card);
  });

  const fab = document.getElementById('fab');
  fab.onclick = () => openEventForm(null, null);
}

function openEventForm(id, existing){
  const songTitles = Object.keys(STATE.songs);
  showModal(`
    <div class="modal-title">${existing ? '일정 수정' : '일정 추가'}</div>
    <div class="field"><label>날짜</label><input type="date" id="f_date" value="${existing?existing.date:todayISO()}"></div>
    <div class="field"><label>연습곡</label>
      <select id="f_song">
        <option value="">선택</option>
        ${songTitles.map(t=>`<option value="${escapeHtml(t)}" ${existing&&existing.songId===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>상태</label>
      <select id="f_status">
        <option value="예정" ${existing&&existing.status==='예정'?'selected':''}>예정</option>
        <option value="완료" ${existing&&existing.status==='완료'?'selected':''}>완료</option>
      </select>
    </div>
    <div class="field"><label>비고</label><textarea id="f_note">${existing?escapeHtml(existing.note||''):''}</textarea></div>
    <div class="field" id="f_participantsWrap">
      <label>참여자 (곡 선택 시 자동 구성, 필요시 체크 해제로 제외)</label>
      <div id="f_participants"></div>
    </div>
    <button class="btn btn-primary btn-block" id="f_submit">${existing?'저장':'추가'}</button>
  `);

  function renderParticipantPicker(songTitle, keepSelected){
    const song = STATE.songs[songTitle];
    const box = document.getElementById('f_participants');
    if(!song){ box.innerHTML = '<div class="section-sub">곡을 먼저 선택해줘</div>'; return; }
    const auto = [];
    ROLES.forEach(role=>{
      (song.roles[role]||[]).forEach(entry=>{
        auto.push({ name: entry.name, role, note: entry.note||'' });
      });
    });
    const selectedNames = keepSelected ? new Set(keepSelected.map(p=>p.name)) : new Set(auto.map(p=>p.name));
    box.innerHTML = auto.map(p=>`
      <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;">
        <input type="checkbox" value="${escapeHtml(p.name)}" data-role="${escapeHtml(p.role)}" ${selectedNames.has(p.name)?'checked':''}>
        <span class="role-label" style="color:var(--ink-soft); font-size:11px;">${escapeHtml(p.role)}</span>
        ${escapeHtml(p.name)}${p.note?` (${escapeHtml(p.note)})`:''}
      </label>
    `).join('');
  }
  renderParticipantPicker(existing?existing.songId:'', existing?existing.participants:null);

  document.getElementById('f_song').addEventListener('change', (e)=>{
    renderParticipantPicker(e.target.value, null);
  });

  document.getElementById('f_submit').addEventListener('click', async ()=>{
    const date = document.getElementById('f_date').value;
    const songId = document.getElementById('f_song').value;
    const status = document.getElementById('f_status').value;
    const note = document.getElementById('f_note').value;
    if(!date || !songId){ toast('날짜와 곡을 선택해줘'); return; }

    const checks = Array.from(document.querySelectorAll('#f_participants input[type=checkbox]:checked'));
    const participants = checks.map(c => ({ name: c.value, role: c.dataset.role }));
    const absence = {};
    const prevAbsence = existing ? (existing.absence||{}) : {};
    participants.forEach(p=>{
      absence[p.name] = prevAbsence[p.name] || { absent:false, reason:'' };
    });

    const payload = { date, songId, status, note, participants, absence };

    if(id){
      await dbSet(`events/${id}`, payload);
      STATE.events[id] = payload;
      toast('수정됨');
    } else {
      const res = await dbPush('events', payload);
      STATE.events[res.name] = payload;
      toast('추가됨');
    }
    closeModal(); render();
  });
}

// ================================================================
// 자료실 (곡별 파트배정 + 밴드부실 사용 — 더 이상 자주 안 바뀌는 참고자료라 탭 통합)
// ================================================================
let REFERENCE_TAB = 'songs'; // 'songs' | 'room'

function renderReference(){
  const view = document.getElementById('view');
  const admin = isAdmin();
  view.innerHTML = `
    <div class="section-title">자료실 ${adminBadgeHtml()}</div>
    <div class="pill-row">
      <button type="button" class="filter-pill ${REFERENCE_TAB==='songs'?'active':''}" data-tab="songs">🎵 곡별 파트배정</button>
      <button type="button" class="filter-pill ${REFERENCE_TAB==='room'?'active':''}" data-tab="room">🚪 밴드부실 사용</button>
    </div>
    <div id="referenceBody"></div>
  `;
  bindAdminBadge();
  view.querySelectorAll('.pill-row .filter-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{ REFERENCE_TAB = btn.dataset.tab; renderReference(); });
  });
  if(REFERENCE_TAB === 'songs') renderSongsSection(document.getElementById('referenceBody'), admin);
  else renderRoomSection(document.getElementById('referenceBody'), admin);
}

function renderSongsSection(container, admin){
  container.innerHTML = admin ? `<button class="btn btn-accent btn-block" id="addSongBtn" style="margin-bottom:12px;">+ 곡 추가</button>` : '';
  const list = document.createElement('div');
  container.appendChild(list);

  Object.entries(STATE.songs).forEach(([title, song])=>{
    const card = document.createElement('div');
    card.className = 'setlist-card';
    card.style.setProperty('--song-color', song.color);
    const chips = ROLES.filter(r => (song.roles[r]||[]).length).map(r =>
      `<div class="role-chip"><span class="role-label">${r}</span>${song.roles[r].map(e=>e.name+(e.note?` (${e.note})`:'')).join(', ')}</div>`
    ).join('');
    card.innerHTML = `
      <div class="stripe"></div>
      <div class="song-title">${escapeHtml(title)}</div>
      <div class="role-grid">${chips}</div>
      ${admin ? `<div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" data-act="edit">수정</button>
        <button class="btn btn-danger btn-sm" data-act="del">삭제</button>
      </div>` : ''}
    `;
    if(admin){
      card.querySelector('[data-act="edit"]').addEventListener('click', ()=> openSongForm(title, song));
      card.querySelector('[data-act="del"]').addEventListener('click', async ()=>{
        if(!confirm(`"${title}" 곡을 삭제할까? (기존 일정 데이터는 남아있음)`)) return;
        await dbRemove(`songs/${encodeURIComponent(title)}`);
        delete STATE.songs[title];
        toast('삭제됨'); render();
      });
    }
    list.appendChild(card);
  });
  if(admin) document.getElementById('addSongBtn').addEventListener('click', ()=> openSongForm(null, null));
}

function renderRoomSection(container, admin){
  const days = WEEKDAYS.slice(0,5); // 월~금
  container.innerHTML = `
    <div class="section-sub" style="margin-top:0;">학생밴드/교사밴드 사용 시간표. 비어있으면 사용 가능.</div>
    <div class="card" style="overflow-x:auto;">
      <table class="room-table">
        <thead><tr><th>시간</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
        <tbody id="roomBody"></tbody>
      </table>
    </div>
  `;
  const body = container.querySelector('#roomBody');
  ROOM_ROWS.forEach(rowLabel=>{
    const tr = document.createElement('tr');
    let rowHtml = `<td>${rowLabel.split(' ')[1]||rowLabel}</td>`;
    days.forEach(day=>{
      const val = (STATE.roomSchedule[day]||{})[rowLabel] || '';
      const cls = val==='학생밴드' ? 'student' : val==='교사밴드' ? 'teacher' : '';
      if(admin){
        rowHtml += `<td class="room-cell ${cls}" data-day="${day}" data-row="${escapeHtml(rowLabel)}" style="cursor:pointer;">${escapeHtml(val)}</td>`;
      } else {
        rowHtml += `<td class="room-cell ${cls}">${escapeHtml(val)}</td>`;
      }
    });
    tr.innerHTML = rowHtml;
    body.appendChild(tr);
  });
  if(admin){
    body.querySelectorAll('td[data-day]').forEach(td=>{
      td.addEventListener('click', async ()=>{
        const day = td.dataset.day, row = td.dataset.row;
        const cur = (STATE.roomSchedule[day]||{})[row] || '';
        const next = cur === '' ? '학생밴드' : cur === '학생밴드' ? '교사밴드' : '';
        await dbPatch(`roomSchedule/${day}`, { [row]: next });
        STATE.roomSchedule[day] = STATE.roomSchedule[day] || {};
        STATE.roomSchedule[day][row] = next;
        renderReference();
      });
    });
  }
}

function openSongForm(title, existing){
  const memberNames = Object.keys(STATE.members).sort();
  const PALETTE = ['#F45B69','#456990','#7EE4EC','#F7B32B','#77C593','#9A48D0','#EF9C66','#5C6B73','#D65DB1','#3D8361'];
  const color = existing ? existing.color : PALETTE[Object.keys(STATE.songs).length % PALETTE.length];

  showModal(`
    <div class="modal-title">${existing ? '곡 정보 수정' : '곡 추가'}</div>
    <div class="field"><label>곡명</label><input type="text" id="s_title" value="${existing?escapeHtml(title):''}" ${existing?'readonly':''}></div>
    <div class="field"><label>카드 색상</label><input type="color" id="s_color" value="${color}"></div>
    ${ROLES.map(role=>{
      const current = existing ? (existing.roles[role]||[]).map(e=>e.name+(e.note?`(${e.note})`:'')).join(', ') : '';
      return `<div class="field"><label>${role}</label><input type="text" id="r_${role}" placeholder="이름1, 이름2(솔로) 형태로 콤마 구분" value="${escapeHtml(current)}"></div>`;
    }).join('')}
    <div class="section-sub">참여자 목록: ${memberNames.join(', ')}</div>
    <button class="btn btn-primary btn-block" id="s_submit">${existing?'저장':'추가'}</button>
  `);

  document.getElementById('s_submit').addEventListener('click', async ()=>{
    const newTitle = document.getElementById('s_title').value.trim();
    if(!newTitle){ toast('곡명을 입력해줘'); return; }
    const colorVal = document.getElementById('s_color').value;
    const roles = {};
    ROLES.forEach(role=>{
      const raw = document.getElementById(`r_${role}`).value.trim();
      roles[role] = raw ? raw.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{
        const m = part.match(/^(.*?)\((.*?)\)$/);
        return m ? { name:m[1].trim(), note:m[2].trim() } : { name: part };
      }) : [];
    });
    const payload = { title: newTitle, color: colorVal, roles };

    if(existing && title !== newTitle){
      await dbRemove(`songs/${encodeURIComponent(title)}`);
      delete STATE.songs[title];
    }
    await dbSet(`songs/${encodeURIComponent(newTitle)}`, payload);
    STATE.songs[newTitle] = payload;
    toast(existing ? '수정됨' : '추가됨');
    closeModal(); render();
  });
}

// ================================================================
// 참여자 관리
// ================================================================
function renderMembers(){
  const view = document.getElementById('view');
  const admin = isAdmin();
  view.innerHTML = `
    <div class="section-title">참여자 ${adminBadgeHtml()}</div>
    <div class="section-sub">고정 불가 시간은 1학기 기준으로 마이그레이션된 값이야. 2학기 값으로 갱신이 필요하면 관리자 모드에서 수정해줘.</div>
    <div id="memberList"></div>
    ${admin ? `<button class="btn btn-accent btn-block" id="addMemberBtn" style="margin-top:8px;">+ 참여자 추가</button>` : ''}
  `;
  bindAdminBadge();

  const list = document.getElementById('memberList');
  Object.entries(STATE.members).sort((a,b)=>a[0].localeCompare(b[0],'ko')).forEach(([name, m])=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="font-weight:700; font-size:15px;">${escapeHtml(name)}</div>
        ${admin ? `<div style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" data-act="edit">수정</button>
          <button class="btn btn-danger btn-sm" data-act="del">삭제</button>
        </div>` : ''}
      </div>
      ${m.unavailable ? `<div class="note-line" style="margin-top:8px;">고정 불가: ${escapeHtml(m.unavailable)}</div>` : ''}
    `;
    if(admin){
      card.querySelector('[data-act="edit"]').addEventListener('click', ()=> openMemberForm(name, m));
      card.querySelector('[data-act="del"]').addEventListener('click', async ()=>{
        if(!confirm(`"${name}"를 참여자 목록에서 삭제할까? (기존 일정 기록은 남아있음)`)) return;
        await dbRemove(`members/${encodeURIComponent(name)}`);
        delete STATE.members[name];
        toast('삭제됨'); render();
      });
    }
    list.appendChild(card);
  });
  if(admin) document.getElementById('addMemberBtn').addEventListener('click', ()=> openMemberForm(null, null));
}

function openMemberForm(name, existing){
  showModal(`
    <div class="modal-title">${existing ? '참여자 정보 수정' : '참여자 추가'}</div>
    <div class="field"><label>이름</label><input type="text" id="m_name" value="${existing?escapeHtml(name):''}"></div>
    <div class="field"><label>고정 불가 시간 (자유 텍스트)</label><input type="text" id="m_unavail" placeholder="예: 월, 화 대학원" value="${existing?escapeHtml(existing.unavailable||''):''}"></div>
    <button class="btn btn-primary btn-block" id="m_submit">${existing?'저장':'추가'}</button>
  `);
  document.getElementById('m_submit').addEventListener('click', async ()=>{
    const newName = document.getElementById('m_name').value.trim();
    if(!newName){ toast('이름을 입력해줘'); return; }
    const unavailable = document.getElementById('m_unavail').value.trim();
    if(existing && name !== newName){
      await dbRemove(`members/${encodeURIComponent(name)}`);
      delete STATE.members[name];
    }
    const payload = { name:newName, unavailable };
    await dbSet(`members/${encodeURIComponent(newName)}`, payload);
    STATE.members[newName] = payload;
    toast(existing?'수정됨':'추가됨');
    closeModal(); render();
  });
}

// ================================================================
// 구글 캘린더 연동 안내
// ================================================================
function renderSync(){
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="section-title">구글 캘린더 연동</div>
    <div class="card">
      <div class="section-sub" style="margin-top:0;">아래 링크를 구독하면, 연습 일정이 본인 캘린더 앱에 자동으로 뜨게 돼. 읽기 전용이라 캘린더에서 직접 수정은 안 되고, 이 앱에서 바뀐 내용이 자동 반영돼(캘린더 앱마다 반영 주기는 조금 다를 수 있음).</div>
      ${ICS_FEED_URL ? `
        <div class="field"><label>구독 링크</label><input type="text" readonly value="${escapeHtml(ICS_FEED_URL)}" onclick="this.select()"></div>
        <button class="btn btn-primary btn-block" id="copyIcs">링크 복사</button>
      ` : `<div class="empty-state">아직 연동 링크가 설정되지 않았어. 관리자에게 문의해줘.</div>`}
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:8px;">구글 캘린더에 구독하는 법</div>
      <ol style="font-size:13px; color:var(--ink-soft); padding-left:18px; line-height:1.7;">
        <li>위 링크 복사</li>
        <li>구글 캘린더 웹 접속 → 왼쪽 "다른 캘린더" 옆 + 클릭</li>
        <li>"URL로 추가" 선택 → 복사한 링크 붙여넣기 → 캘린더 추가</li>
      </ol>
      <div style="font-weight:700; margin:14px 0 8px;">아이폰 캘린더 앱에 구독하는 법</div>
      <ol style="font-size:13px; color:var(--ink-soft); padding-left:18px; line-height:1.7;">
        <li>설정 → 캘린더 → 계정 → 계정 추가 → 기타 → 구독 캘린더 추가</li>
        <li>복사한 링크 붙여넣기 → 다음 → 저장</li>
      </ol>
    </div>
  `;
  if(ICS_FEED_URL){
    document.getElementById('copyIcs').addEventListener('click', ()=>{
      navigator.clipboard.writeText(ICS_FEED_URL);
      toast('링크가 복사됐어');
    });
  }
}

// ================================================================
// 초기화
// ================================================================
async function init(){
  document.getElementById('identityChip').addEventListener('click', openIdentityModal);
  document.querySelectorAll('.bottom-nav button').forEach(btn=>{
    btn.addEventListener('click', ()=> navigate(btn.dataset.route));
  });
  window.addEventListener('hashchange', render);

  try{
    await loadAll();
  }catch(err){
    document.getElementById('view').innerHTML = `<div class="empty-state">데이터를 불러오지 못했어. Firebase 설정(config.js)이나 네트워크를 확인해줘.<br>${escapeHtml(err.message)}</div>`;
    return;
  }

  renderIdentityChip();
  if(!getIdentity()){
    openIdentityModal();
  }
  render();
}

init();
