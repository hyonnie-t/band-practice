// ============================================================
// 환경 설정 — 이 파일만 프로젝트별로 바꾸면 됨
// ============================================================

// Firebase Realtime Database 주소 (SDK 없이 REST API로 직접 fetch)
const DB_URL = "https://daeyoung-band-default-rtdb.firebaseio.com";

// 관리자(효니 + 지정 소수) 전용 키.
// ⚠ 이건 서버 검증이 아니라 클라이언트에서 문자열 비교하는 수준의 UI 잠금임.
//    RTDB 규칙 자체는 열려있으므로, 마음먹으면 개발자도구로 우회 가능한 구조.
//    20명 신뢰 그룹 기준으로 채택한 트레이드오프.
const ADMIN_KEY = "daeyoung12";

// ICS(구글/애플 캘린더 구독) 피드 URL — GAS 배포 후 이 값 채우기
const ICS_FEED_URL = ""; // 예: "https://script.google.com/macros/s/AKfycbw3T8ykStmFt_Ch789KxqxHWqL1QK8qI1WavF75TBf8e2TKctEFbhwbfQuahhqA2jDkCg/exec"
