// src/app/(app)/ws/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Editor from "@/components/Editor";
import { ENDPOINTS } from "@/lib/endpoints";

type Crumb = { section: string; title: string };

const MAP_KEY = "ws:doc2meeting";
const HEADER_H = 56;

function getCsrf() {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
}

export default function WorkspacePage() {
  const params = useParams();
  const rawId = (params?.id as string) ?? "";

  const [crumb, setCrumb] = useState<Crumb>({
    section: "내 파일",
    title: "제목 없는 문서",
  });
  const [meetingId, setMeetingId] = useState<number | null>(null);

  // 숫자 id 여부
  const numericId = useMemo(
    () => (rawId && /^\d+$/.test(rawId) ? Number(rawId) : null),
    [rawId]
  );

  /* ① 빵부스러기 복구 */
  useEffect(() => {
    if (!rawId) return;
    try {
      const saved = localStorage.getItem("ws:breadcrumb");
      if (saved) {
        const j = JSON.parse(saved) as Crumb;
        if (j?.section && j?.title) {
          setCrumb(j);
          return;
        }
      }
      const meta = localStorage.getItem(`meta:${rawId}`);
      if (meta) {
        const j = JSON.parse(meta) as Crumb;
        if (j?.section && j?.title) setCrumb(j);
      }
    } catch {}
  }, [rawId]);

  /* ② meetingId 확보
   * - 경로가 숫자면: 그 id가 실제로 존재하는지 확인만(없으면 persist 끄고 사용)
   * - 숫자가 아니면: 로컬 매핑(ws:doc2meeting) → 검증 → 없으면 새로 생성
   */
  useEffect(() => {
    if (!rawId) return;

    let aborted = false;

    async function ensureMeetingForDoc(docKey: string) {
      // 1) 로컬 매핑
      const map: Record<string, number> = (() => {
        try {
          return JSON.parse(localStorage.getItem(MAP_KEY) || "{}");
        } catch {
          return {};
        }
      })();

      const saved = map[docKey];
      if (saved) {
        try {
          const r = await fetch(ENDPOINTS.meetings.detail(saved), {
            method: "GET",
            credentials: "include",
          });
          if (r.ok) {
            if (!aborted) setMeetingId(saved);
            return;
          }
          if (r.status === 404) {
            delete map[docKey];
            localStorage.setItem(MAP_KEY, JSON.stringify(map));
          }
        } catch {
          // 네트워크 이슈면 아래 생성 시도
        }
      }

      // 2) 없으면 생성
      try {
        const csrftoken = getCsrf();
        const res = await fetch(ENDPOINTS.meetings.create, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ title: crumb.title || `Doc ${docKey}` }),
        });

        const txt = await res.text().catch(() => "");
        let j: any = {};
        try {
          j = txt ? JSON.parse(txt) : {};
        } catch {}

        if (!res.ok) {
          console.error("meeting 생성 실패:", res.status, j || txt);
          return;
        }

        const newId = Number(j?.id);
        if (!newId) {
          console.error("meeting 생성 실패: invalid id", j || txt);
          return;
        }

        map[docKey] = newId;
        localStorage.setItem(MAP_KEY, JSON.stringify(map));
        if (!aborted) setMeetingId(newId);
      } catch (e) {
        console.error("meeting 생성 에러:", e);
      }
    }

    async function verifyNumeric(id: number) {
      try {
        const r = await fetch(ENDPOINTS.meetings.detail(id), {
          method: "GET",
          credentials: "include",
        });
        if (r.ok) {
          if (!aborted) setMeetingId(id);
        } else if (r.status === 404) {
          // 존재하지 않으면 그냥 meetingId 없이 사용(에디터 persist 꺼짐)
          if (!aborted) setMeetingId(null);
        }
      } catch {
        // 네트워크 이슈면 일단 끄기
        if (!aborted) setMeetingId(null);
      }
    }

    if (numericId != null) {
      verifyNumeric(numericId);
    } else {
      ensureMeetingForDoc(rawId);
    }

    return () => {
      aborted = true;
    };
  }, [rawId, numericId, crumb.title]);

  return (
    <div className="flex-1 min-w-0">
      {/* 상단 헤더 */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 h-14">
        <div className="h-full flex items-center gap-2 px-6">
          <span className="text-neutral-500">{crumb.section}</span>
          <span className="text-neutral-300">›</span>
          <span className="text-xl font-semibold truncate">{crumb.title}</span>
        </div>
      </div>

      {/* meetingId가 준비된 경우에만 서버 연동(persist) 활성화 */}
      <Editor
        docId={rawId}
        toolbarOffset={HEADER_H}
        meetingId={meetingId ?? undefined}
        persist={!!meetingId}
      />
    </div>
  );
}
