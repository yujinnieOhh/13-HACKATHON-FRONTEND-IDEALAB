// src/lib/workspace.ts
export type WsRecord = {
  id: string;                 // 고유ID(로컬)
  meetingId?: number | null;  // 서버 meeting id (있으면)
  blockId?: string;           // 서버에 저장된 블록 id (있으면)
  title: string;              // 표시에 쓸 타이틀
  snippet: string;            // 한두 줄 요약
  createdAt: number;          // ms
};

function key(wsId: string) {
  return `ws:records:${wsId}`;
}

export function listWsRecords(wsId: string): WsRecord[] {
  try {
    return JSON.parse(localStorage.getItem(key(wsId)) || "[]");
  } catch {
    return [];
  }
}

export function pushWsRecord(wsId: string, rec: WsRecord) {
  const cur = listWsRecords(wsId);
  const next = [rec, ...cur].slice(0, 200);
  localStorage.setItem(key(wsId), JSON.stringify(next));
  // 구독자에게 브로드캐스트 (좌측 패널 갱신용)
  window.dispatchEvent(new CustomEvent("ws:records:update", { detail: { wsId, rec } }));
}
