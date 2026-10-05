// Firebase Realtime Database 백업 — 컴퓨터에서 `node tools/backup.mjs`로 실행 (Node 18 이상)
// 규칙을 조인 뒤에는 루트(/.json)를 읽을 수 없어서, 익명 토큰으로 경로별로 읽어 한 파일로 합친다.
// 결과는 backup/날짜시각.json 에 저장된다. 이 폴더는 .gitignore라 커밋되지 않는다(데이터를 공개 레포에 올리지 말 것).
//
// 사용법:
//   FB_API_KEY=웹API키 node tools/backup.mjs
// 읽을 경로가 앱과 다르면 PATHS 환경변수(쉼표 구분)로 바꾼다.
import { mkdirSync, writeFileSync } from 'node:fs';

const DB_URL = process.env.DB_URL || 'https://daeyoung-band-default-rtdb.firebaseio.com';
const KEY = process.env.FB_API_KEY;
const PATHS = (process.env.PATHS || 'members,songs,events,roomSchedule,schoolCalendar').split(',').map(s => s.trim()).filter(Boolean);
if (!KEY) { console.error('FB_API_KEY 환경변수가 필요해 (Firebase 콘솔 > 프로젝트 설정 > 웹 API 키)'); process.exit(1); }

const su = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
});
if (!su.ok) { console.error('익명 로그인 실패', su.status, '— 콘솔에서 Authentication > 로그인 방법 > 익명을 켰는지 확인'); process.exit(1); }
const token = (await su.json()).idToken;

const out = {};
let failed = 0;
for (const p of PATHS) {
  const r = await fetch(`${DB_URL}/${p}.json?auth=${encodeURIComponent(token)}`);
  if (!r.ok) { console.error(`실패: ${p} (${r.status})`); failed++; continue; }
  out[p] = await r.json();
  console.log(`읽음: ${p}`);
}
mkdirSync('backup', { recursive: true });
const name = `backup/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(name, JSON.stringify(out, null, 1));
console.log('저장:', name, failed ? `(${failed}개 경로 실패)` : '');
process.exit(failed ? 2 : 0);
