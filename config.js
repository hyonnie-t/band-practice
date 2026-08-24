// ============================================================
// 환경 설정 — 이 파일만 프로젝트별로 바꾸면 됨
// ============================================================

// Firebase Realtime Database 주소 (SDK 없이 REST API로 직접 fetch)
const DB_URL = "https://daeyoung-band-default-rtdb.firebaseio.com";

// 관리자(효니 + 지정 소수) 전용 키.
// ⚠ 해시로 저장해서 레포를 훑어봐도 평문 키가 바로 보이진 않지만,
//    이건 "레포 열람 시 즉시 노출"만 막는 조치고 진짜 서버단 보안은 아님.
//    RTDB 규칙 자체가 열려있으므로, 개발자도구에서 localStorage에 bp_admin=true를
//    직접 심으면 여전히 우회 가능한 구조. 20명 신뢰 그룹 기준으로 채택한 트레이드오프.
//    진짜로 막으려면 Firebase Authentication을 붙여서 RTDB 규칙 자체를
//    "인증된 사용자만 쓰기 가능"으로 바꿔야 함 (필요해지면 언제든 요청해줘).
//
// 키를 바꾸고 싶으면: 브라우저 개발자도구 콘솔에서 아래 실행 후 나온 값을 붙여넣기
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('새키')).then(b=>console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
const ADMIN_KEY_HASH = "17618c0f12dea18511de08d7d25da335dec354df6db60f8cf7c393278cf5da7d";

// ICS(구글/애플 캘린더 구독) 피드 URL — GAS 배포 후 이 값 채우기
const ICS_FEED_URL = ""; // 예: "https://script.google.com/macros/s/AKfycbw3T8ykStmFt_Ch789KxqxHWqL1QK8qI1WavF75TBf8e2TKctEFbhwbfQuahhqA2jDkCg/exec"
