// src/lib/endpoints.ts

/** 1) ENV 값 정리: "undefined"/"null" 같은 문자열도 무시 */
const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
const envBase =
  raw && raw !== "undefined" && raw !== "null" ? raw.replace(/\/+$/, "") : "";

/** 2) 브라우저에서 추측용 fallback
 * - origin 기반으로 만들고
 * - 포트가 없고 host가 localhost일 때만 :8000 붙여줌(로컬 백엔드가 8000일 때)
 * - 다른 호스트(예: 65.0.101.130)면 포트 안 붙임
 */
const fallbackBase =
  typeof window !== "undefined"
    ? (() => {
        const { protocol, hostname, port } = window.location;
        const base = `${protocol}//${hostname}`;
        if (port) return `${base}:${port}`;
        if (hostname === "localhost") return `${base}:8000`; // 필요 시 8000 변경
        return base; // 외부 IP/도메인은 포트 생략
      })()
    : "";

/** 3) 최종 API/WS BASE */
export const API_URL = envBase || fallbackBase;
export const WS_BASE = API_URL
  ? API_URL.replace(/^http(s?):\/\//, "ws$1://")
  : "";

/** 4) 경고 로그(눈에 띄게) */
if (!API_URL) {
  // 여기서 throw 하면 빌드 타이밍에 죽을 수 있으니 에러 로그만
  console.error(
    "[ENDPOINTS] API_URL 이 비어있습니다. .env.local 에 NEXT_PUBLIC_API_URL=http://HOST[:PORT] 를 설정하세요."
  );
}

/** 5) 엔드포인트 */
export const ENDPOINTS = {
  login: `${API_URL}/api/user/login/`,
  signup: `${API_URL}/api/user/signup/`,

  meetings: {
    list: `${API_URL}/api/meetings/`,
    create: `${API_URL}/api/meetings/`,
    detail: (id: string | number) => `${API_URL}/api/meetings/${id}/`,
    update: (id: string | number) => `${API_URL}/api/meetings/${id}/`,
    delete: (id: string | number) => `${API_URL}/api/meetings/${id}/`,
    finalize: (id: string | number) => `${API_URL}/api/meetings/${id}/finalize/`,
    stt: {
      chunk: (id: string | number) => `${API_URL}/api/meetings/${id}/stt-chunk/`,
      finalize: (id: string | number) => `${API_URL}/api/meetings/${id}/finalize/`,
      ws: (id: string | number) => `${WS_BASE}/api/meetings/${id}/stt-stream/?persist=true`,
    },
    minutes: {
      live: (id: string | number) => `${API_URL}/api/meetings/${id}/minutes/live/`,
      final: (id: string | number) => `${API_URL}/api/meetings/${id}/minutes/final/`,
    },
    keywords: {
      extract: (id: string | number) => `${API_URL}/api/meetings/${id}/keywords/extract/`,
      list: (id: string | number) => `${API_URL}/api/meetings/${id}/keywords/`,
    },
  },
  blocks: {
    list: `${API_URL}/api/blocks/`,
    create: `${API_URL}/api/blocks/`,
    detail: (id: string | number) => `${API_URL}/api/blocks/${id}/`,
    update: (id: string | number) => `${API_URL}/api/blocks/${id}/`,
    reorder: (id: string | number) => `${API_URL}/api/blocks/${id}/reorder/`,
    revisions: (id: string | number) => `${API_URL}/api/blocks/${id}/revisions/`,
    restore: (id: string | number) => `${API_URL}/api/blocks/${id}/restore/`,
    updateCell: (id: string | number) => `${API_URL}/api/blocks/${id}/update_cell/`,
    insertRow: (id: string | number) => `${API_URL}/api/blocks/${id}/insert_row/`,
    deleteRow: (id: string | number) => `${API_URL}/api/blocks/${id}/delete_row/`,
    insertCol: (id: string | number) => `${API_URL}/api/blocks/${id}/insert_col/`,
    deleteCol: (id: string | number) => `${API_URL}/api/blocks/${id}/delete_col/`,
    renameCol: (id: string | number) => `${API_URL}/api/blocks/${id}/rename_col/`,
    setColWidth: (id: string | number) => `${API_URL}/api/blocks/${id}/set_col_width/`,
  },
  docs: {
    update: (docId: string | number) =>
      `${API_URL}/api/docs/${encodeURIComponent(docId)}/`,
  },
  analytics: {
    storeCounts: `${API_URL}/api/analytics/store-counts/`,
    changeIndex: `${API_URL}/api/analytics/change-index/`,
    closures: `${API_URL}/api/analytics/closures/`,
    industryMetrics: `${API_URL}/api/analytics/industry-metrics/`,
    salesEstimates: `${API_URL}/api/analytics/sales-estimates/`,
  },
  attachments: {
    list: `${API_URL}/api/attachments/`,
    create: `${API_URL}/api/attachments/`,
  },
};
