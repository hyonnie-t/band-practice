// ============================================================
// 환경 설정 — 이 파일만 프로젝트별로 바꾸면 됨
// ============================================================

// Firebase Realtime Database 주소 (SDK 없이 REST API로 직접 fetch)
const DB_URL = "https://daeyoung-band-default-rtdb.firebaseio.com";

// ── Firebase 익명 인증 (REST) ─────────────────────────────────────────
// FB_API_KEY: Firebase 콘솔 > 프로젝트 설정 > 일반 > 웹 API 키. 공개돼도 되는 값이다(접근 제어는 DB 규칙이 한다).
// 비워두면 인증 없이 지금처럼 동작한다. 콘솔에서 Authentication > 익명 로그인을 켠 뒤 채울 것.
// 이 블록은 window.fetch를 감싸 DB 주소로 가는 요청에만 ?auth=토큰을 붙인다 — 개별 fetch 호출은 고치지 않는다.
// 토큰을 못 받으면(오프라인·콘솔 미설정) 토큰 없이 그대로 보내 규칙이 판단하게 한다.
const FB_API_KEY='AIzaSyCNB62DS9UUoVtNFFqwb6pacWZmjgnLKfA';
window.fbUid=async function(){return '';};
(function(){
  if(!FB_API_KEY)return;
  const RK='fb_anon_refresh',nativeFetch=window.fetch.bind(window);
  let tok='',exp=0,pending=null;
  const lsGet=()=>{try{return localStorage.getItem(RK)||'';}catch(e){return '';}};
  const lsSet=v=>{try{localStorage.setItem(RK,v);}catch(e){}};
  async function viaRefresh(rt){
    const r=await nativeFetch('https://securetoken.googleapis.com/v1/token?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(rt)});
    if(!r.ok)return null;
    const j=await r.json();
    return {t:j.id_token,r:j.refresh_token,s:+j.expires_in};
  }
  async function viaSignUp(){
    const r=await nativeFetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
    if(!r.ok)return null;
    const j=await r.json();
    return {t:j.idToken,r:j.refreshToken,s:+j.expiresIn};
  }
  async function getToken(){
    if(tok&&Date.now()<exp-60000)return tok;
    if(pending)return pending;
    pending=(async()=>{
      try{
        const rt=lsGet();
        const g=(rt&&await viaRefresh(rt))||await viaSignUp();
        if(!g)return '';
        tok=g.t;exp=Date.now()+g.s*1000;lsSet(g.r);
        return tok;
      }catch(e){return '';}
      finally{pending=null;}
    })();
    return pending;
  }
  // 현재 익명 계정의 uid(관리자 표시를 이 uid 아래에 남기려고 쓴다). 토큰을 못 받으면 ''.
  window.fbUid=async function(){
    const t=await getToken();
    try{return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).user_id||'';}catch(e){return '';}
  };
  window.fetch=async function(input,init){
    if(typeof input==='string'&&input.indexOf(DB_URL)===0){
      const t=await getToken();
      if(t)input+=(input.indexOf('?')<0?'?':'&')+'auth='+encodeURIComponent(t);
    }
    return nativeFetch(input,init);
  };
})();

// 관리자 모드: 키를 이 파일에 두지 않는다. 입력한 키를 DB의 admin/claims/{내 uid}에 쓰면, DB 규칙이
// 콘솔에 저장된 adminSecret과 같을 때만 기록을 허용한다(firebase/README.md). 키가 맞아야 곡·참여자·학사일정·
// 시간표·일정 쓰기가 서버에서 열린다. 키 해시를 공개 레포에 두던 예전 방식(ADMIN_KEY_HASH)은 없앴다.
// 키를 바꾸려면 콘솔에서 adminSecret 값만 바꾸면 되고, 기존 관리자 표시는 자동으로 무효가 된다.
async function claimAdmin(key){
  const uid = await window.fbUid();
  if(!uid){ const e = new Error('no-auth'); e.code = 'no-auth'; throw e; }
  const res = await fetch(`${DB_URL}/admin/claims/${uid}.json`, { method:'PUT', body: JSON.stringify(key) });
  if(!res.ok){ const e = new Error('claim failed'); e.status = res.status; throw e; }
  localStorage.setItem('bp_admin_uid', uid);
}

// ICS(구글/애플 캘린더 구독) 피드 URL — GAS 배포 후 이 값 채우기
const ICS_FEED_URL = ""; // 예: "https://script.google.com/macros/s/AKfycbw3T8ykStmFt_Ch789KxqxHWqL1QK8qI1WavF75TBf8e2TKctEFbhwbfQuahhqA2jDkCg/exec"
