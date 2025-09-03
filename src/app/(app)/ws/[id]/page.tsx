// File: src/app/(app)/ws/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Editor from "@/components/Editor";

type Crumb = { section: string; title: string };

const HEADER_H = 56;

export default function WorkspacePage() {
  const params = useParams();
  const rawId = (params?.id as string) ?? "";

  const [crumb, setCrumb] = useState<Crumb>({
    section: "내 파일",
    title: "제목 없는 문서",
  });

  // ① 상단 경로/제목 복구 (로컬 저장소에서만)
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
    } catch {
      // ignore
    }
  }, [rawId]);

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

      {/* 로컬 저장 전용 에디터 */}
      <Editor
        docId={rawId}
        toolbarOffset={HEADER_H}
        persist={false}          // ← 백엔드 저장 끔 (로컬 저장만)
      />
    </div>
  );
}
