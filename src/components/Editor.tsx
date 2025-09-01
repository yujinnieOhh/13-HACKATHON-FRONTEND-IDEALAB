// File: src/components/Editor.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import {Table} from "@tiptap/extension-table"; // ✅ default import (중요!)
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

import RegionMark from "@/extensions/RegionMark";
import RecorderPanel from "./RecorderPanel";
import { useUIStore } from "@/store/ui";
import { useInsightStore } from "@/store/insight";
import { ENDPOINTS } from "@/lib/endpoints";
import { pushWsRecord } from "@/lib/workspace";

/* ───────────── 유틸 ───────────── */
function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number) {
  let last = 0;
  let tid: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const left = ms - (now - last);
    if (left <= 0) {
      last = now;
      if (tid) clearTimeout(tid);
      fn(...args);
    } else {
      if (tid) clearTimeout(tid);
      tid = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, left);
    }
  };
}

function debounce<F extends (...args: any[]) => void>(fn: F, wait: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<F> | null = null;
  const wrapped = (...args: Parameters<F>) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const a = lastArgs;
      lastArgs = null;
      t = null;
      if (a) fn(...a);
    }, wait);
  };
  (wrapped as any).flush = () => {
    if (t) {
      clearTimeout(t);
      t = null;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }
  };
  return wrapped as F & { flush: () => void };
}

function esc(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/* Body portal */
function BodyPortal({ children }: { children: React.ReactNode }) {
  if (typeof window === "undefined") return null;
  return createPortal(children, document.body);
}

/* ───────────── API 래퍼(백엔드 저장 전용) ───────────── */
async function apiCreateBlock(params: {
  meeting: number;
  text: string;
  parent_block?: number | null;
  order_no?: number;
  type?: string;
  level?: number;
}) {
  const body = {
    meeting: params.meeting,
    parent_block: params.parent_block ?? null,
    order_no: params.order_no ?? 1,
    type: params.type ?? "paragraph",
    level: params.level ?? 0,
    text: params.text,
  };

  const csrftoken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
  const res = await fetch(ENDPOINTS.blocks.create, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const txt = await res.text().catch(() => "");
  let data: any = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch {}

  if (!res.ok) {
    const err: any = new Error(`create ${res.status}`);
    err.status = res.status;
    err.body = txt;
    throw err;
  }

  return {
    id: String(data.id ?? data.pk ?? data.block_id),
    version: Number(data.version ?? 1),
  };
}

async function apiGetBlock(id: string) {
  const res = await fetch(ENDPOINTS.blocks.detail(id), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  const txt = await res.text().catch(() => "");
  let data: any = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch {}
  if (!res.ok) {
    const err: any = new Error(`get ${res.status}`);
    err.status = res.status;
    err.body = txt;
    throw err;
  }
  return {
    version: Number(data.version ?? 1),
    text: String(data.text ?? ""),
  };
}

async function apiPatchBlock(id: string, text: string, version: number) {
  const res = await fetch(ENDPOINTS.blocks.update(id), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "",
    },
    credentials: "include",
    body: JSON.stringify({ text, version }),
  });

  const bodyText = await res.text().catch(() => "");
  let data: any = {};
  try { data = bodyText ? JSON.parse(bodyText) : {}; } catch {}

  if (!res.ok) {
    const cur = data?.detail?.current?.version ?? data?.current?.version ?? data?.version ?? null;
    const err: any = new Error(`patch ${res.status}`);
    err.status = res.status;
    err.currentVersion = cur;
    err.body = bodyText;
    throw err;
  }

  const newVersion = Number(data.version ?? version + 1);
  return { version: newVersion };
}

/* ───────────── Props ───────────── */
export type EditorProps = {
  docId: string | number;
  initialHTML?: string;
  toolbarOffset?: number;
  toolbarTheme?: "light" | "dark";
  /** 서버 저장 사용 (true 권장) */
  persist?: boolean;
  meetingId?: string | number;
};

/* 같은 이름 확장 중복 제거 (tiptap 경고 방지) */
function dedupeExtensions<T extends { name?: string }>(exts: T[]) {
  const seen = new Set<string>();
  return exts.filter((e) => {
    const n = (e as any)?.name;
    if (!n) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

/* ==================== 메인 Editor ==================== */
export default function Editor({
  docId,
  initialHTML,
  toolbarOffset = 0,
  toolbarTheme = "light",
  persist = true,  // ⬅️ 기본값을 백엔드 저장으로
  meetingId,
}: EditorProps) {
  const setRegion = useInsightStore((s) => s.setRegion);
  const openRightFromStore =
    useUIStore((s: any) => s.openRightPanel || s.setRightOpen || s.openRight || null);

  const serverDownRef = useRef(false);  // 404/405 등으로 서버 저장 비활성화
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");

  // 숫자 meeting id
  const numericMeeting = useMemo(() => {
    if (!persist) return null;
    if (typeof meetingId === "number") return meetingId;
    if (typeof meetingId === "string" && /^\d+$/.test(meetingId)) return Number(meetingId);
    return null;
  }, [meetingId, persist]);

  /* 확장 */
  const extensions = useMemo(
    () =>
      dedupeExtensions([
        StarterKit.configure({
          bulletList: { keepMarks: true },
          orderedList: { keepMarks: true },
        }),
        Placeholder.configure({
          placeholder: "여기에 자유롭게 작성하세요…",
          emptyEditorClass:
            "before:content-[attr(data-placeholder)] before:text-neutral-400 before:float-left before:h-0 pointer-events-none",
        }),
        Underline,
        Link.configure({ autolink: true, openOnClick: true, linkOnPaste: true }),
        Image.configure({ allowBase64: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Table.configure({ resizable: true, lastColumnResizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        RegionMark,
      ]),
    []
  );

  /* TipTap */
  const editor = useEditor({
    extensions,
    // ⬇️ 로컬 복구 없음: initialHTML 또는 빈 문서만
    content: initialHTML ?? `<h1>새 문서</h1><p>여기에 자유롭게 작성해 보세요.</p>`,
    autofocus: "end",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap prose prose-neutral max-w-none focus:outline-none min-h-[70dvh] px-0 py-0",
      },
    },
  });

  /* RegionMark → Right panel 열기 */
  useEffect(() => {
    (window as any).__setRegion = (name: string) => {
      try {
        setRegion(name);
        if (typeof openRightFromStore === "function") {
          try { openRightFromStore({ source: "region", region: name }); }
          catch { openRightFromStore(true); }
        }
        window.dispatchEvent(new CustomEvent("insight:region", { detail: name }));
      } catch {}
    };
    return () => { delete (window as any).__setRegion; };
  }, [setRegion, openRightFromStore]);

  /* 블록 id / version */
  const initialBlockId = useMemo(() => {
    const s = String(docId);
    return /^\d+$/.test(s) ? s : null; // 숫자면 그걸 블록 id로 사용
  }, [docId]);

  const [blockId, setBlockId] = useState<string | null>(initialBlockId);
  const [version, setVersion] = useState<number | null>(null);

  // 기존 블록이면 버전 가져오기
  useEffect(() => {
    (async () => {
      if (!persist || serverDownRef.current) return;
      if (!blockId) return;
      try {
        const info = await apiGetBlock(blockId);
        setVersion(info.version);
        // 원한다면 아래에서 editor에 서버 텍스트를 적용할 수 있음
        // editor?.commands.setContent(info.text, false);
      } catch (e: any) {
        if (e?.status === 404 || e?.status === 405) serverDownRef.current = true;
        console.warn("[init] get block failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, persist]);

  /* 블록 보장(없으면 생성) */
  async function ensureBlockId(getHtml: () => string) {
    if (!persist || serverDownRef.current) return { id: null as string | null, ver: null as number | null };
    if (blockId && version != null) return { id: blockId, ver: version };
    if (!numericMeeting) {
      console.warn("[autosave] meetingId(숫자)가 없어 블록을 만들 수 없음");
      return { id: null, ver: null };
    }
    try {
      const created = await apiCreateBlock({
        meeting: numericMeeting,
        text: getHtml(),
        parent_block: null,
        order_no: 1,
        type: "paragraph",
        level: 0,
      });
      setBlockId(created.id);
      setVersion(created.version);
      return { id: created.id, ver: created.version };
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 405) serverDownRef.current = true;
      console.warn("[create] block create failed:", e);
      return { id: null, ver: null };
    }
  }

  /* ── 🔵 디바운스 서버 저장만 사용 (로컬 저장 완전 제거) ── */
  const SAVE_DEBOUNCE_MS = 1000;

  const saveToServer = useMemo(
    () =>
      debounce(async (html: string) => {
        if (!persist || serverDownRef.current) return;
        setSaveStatus("saving");
        try {
          const info = await ensureBlockId(() => html);
          if (!info.id || info.ver == null) { setSaveStatus("error"); return; }

          try {
            const r1 = await apiPatchBlock(info.id, html, info.ver);
            setVersion(r1.version);
            setSaveStatus("saved");
            // 2초 후 표시를 idle로
            setTimeout(() => setSaveStatus("idle"), 2000);
            return;
          } catch (e: any) {
            if (e?.status === 409) {
              try {
                const latest = await apiGetBlock(info.id);
                const r2 = await apiPatchBlock(info.id, html, latest.version);
                setVersion(r2.version);
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
                return;
              } catch (e2) {
                console.warn("재시도 실패:", e2);
              }
            }
            throw e;
          }
        } catch (e: any) {
          if (e?.status === 404 || e?.status === 405) serverDownRef.current = true;
          setSaveStatus("error");
          console.warn("서버 저장 실패:", e);
        }
      }, SAVE_DEBOUNCE_MS),
    [persist, blockId, version, numericMeeting] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!editor) return;
    const onUpdate = throttle(() => {
      try {
        const html = editor.getHTML();
        // ⬇️ 로컬 저장 없음, 오직 서버 디바운스 저장
        saveToServer(html);
      } catch {}
    }, 120);
    editor.on("update", onUpdate);
    return () => {
      try { (saveToServer as any).flush?.(); } catch {}
    };
  }, [editor, saveToServer]);

  /* 녹음 패널 */
  const [recOpen, setRecOpen] = useState(false);
  const setCollapsed = useUIStore((s) =>
    (s as any).setCollapsed?.bind?.(null, undefined) ? (s as any).setCollapsed : () => {}
  );

  const handleOpenRecorder = async () => {
    if (!persist || numericMeeting == null) {
      alert("회의 녹음은 서버 연결이 필요합니다. (persist=true + meetingId 설정)");
      return;
    }
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch {
      alert("마이크 권한을 허용해 주세요 (주소창 왼쪽 자물쇠 → 마이크: 허용).");
      return;
    }
    try { setCollapsed(true as any); } catch {}
    setRecOpen(true);
  };

  const handleCloseRecorder = () => {
    try { setCollapsed(false as any); } catch {}
    setRecOpen(false);
  };

  if (!editor) {
    return <div className="min-h-[70dvh] px-8 py-8 animate-pulse text-neutral-300">에디터 로딩 중…</div>;
  }

  const effectiveMeetingId = numericMeeting ?? undefined;

  return (
    <div className="w-full">
      {/* 상단 툴바 (녹음 중 숨김) */}
      {!recOpen && (
        <div className="sticky z-30 w-full bg-white/90 backdrop-blur" style={{ top: toolbarOffset }}>
          <div className="mx-auto w-full px-4 py-2 flex items-center gap-3">
            <Toolbar editor={editor} theme={toolbarTheme} onOpenRecorder={handleOpenRecorder} />
            <div className="ml-auto text-xs">
              {saveStatus === "saving" && <span className="text-slate-500">저장 중…</span>}
              {saveStatus === "saved" && <span className="text-emerald-600">저장됨</span>}
              {saveStatus === "error" && <span className="text-rose-600">저장 실패</span>}
              {!persist && <span className="text-amber-600">서버 저장 비활성화</span>}
              {persist && numericMeeting == null && <span className="text-amber-600">회의 ID 준비 중…</span>}
              {persist && serverDownRef.current && <span className="text-rose-600">서버 저장 불가</span>}
            </div>
          </div>
        </div>
      )}

      {/* 본문 or 녹음창 */}
      <div className="mx-auto w-full px-8 py-8">
        {recOpen ? (
          <RecorderPanel
            meetingId={effectiveMeetingId}
            onClose={handleCloseRecorder}
            onFinish={async (p) => {
              // 요약/메모 삽입
              const summaryHTML = p.summary.trim()
                ? `<section class="rounded-xl border border-sky-200 bg-sky-50/50 p-4 mb-3">
                    <h4 class="font-semibold text-sky-700 mb-2">요약</h4>
                    <ul class="list-disc pl-5">
                      ${p.summary.split(/\n+/).filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join("")}
                    </ul>
                  </section>`
                : "";

              const memoText = (p as any).memo as string | undefined;
              const memoHTML = memoText && memoText.trim()
                ? `<section class="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <h4 class="font-semibold text-amber-700 mb-2">회의 메모</h4>
                    <ul class="list-disc pl-5">
                      ${memoText.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => `<li>${esc(line)}</li>`).join("")}
                    </ul>
                  </section>`
                : "";

              const html = `<div class="rec-block">${summaryHTML}${memoHTML}</div>`;
              editor.commands.insertContent(html);

              try { (saveToServer as any).flush?.(); } catch {}

              // 블록으로도 저장(가능하면)
              try {
                if (numericMeeting) {
                  await apiCreateBlock({
                    meeting: numericMeeting,
                    text: html,
                    parent_block: null,
                    order_no: 1,
                    type: "summary",
                    level: 0,
                  });
                }
              } catch (e) {
                console.warn("[ws-record] block create failed:", e);
              }

              // 좌측 '최근 회의 기록' (원하면 제거 가능)
              try {
                const first =
                  p.summary.split(/\n+/).map((s) => s.trim()).find((s) => s) ||
                  (memoText || "").split(/\n+/).map((s) => s.trim()).find((s) => s) ||
                  "회의 기록";
                pushWsRecord(String(docId), {
                  id: `${Date.now()}`,
                  meetingId: numericMeeting ?? null,
                  blockId: undefined,
                  title: "회의 요약",
                  snippet: first.slice(0, 120),
                  createdAt: Date.now(),
                });
              } catch {}
            }}
          />
        ) : (
          <>
            <style jsx global>{`
              .tiptap span[data-region] {
                font-weight: 700;
                color: #0472de;
                cursor: pointer;
              }
              .tiptap span[data-region]:hover {
                text-decoration: underline;
              }
            `}</style>
            <EditorContent editor={editor} />
          </>
        )}
      </div>
    </div>
  );
}

/* ==================== Toolbar ==================== */
function Toolbar({
  editor,
  theme = "light",
  onOpenRecorder,
}: {
  editor: TiptapEditor;
  theme?: "dark" | "light";
  onOpenRecorder: () => void;
}) {
  const [tableBarOpen, setTableBarOpen] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  useEffect(() => {
    const fn = () => setTableBarOpen(editor.isActive("table"));
    editor.on("selectionUpdate", fn);
    return () => editor.off("selectionUpdate", fn);
  }, [editor]);

  const tone =
    theme === "dark"
      ? "bg-neutral-900 text-neutral-100 border-neutral-800 shadow-sm"
      : "bg-white text-neutral-900 border-neutral-200 shadow";
  const btnBase = "h-9 rounded-md px-2 text-sm inline-flex items-center justify-center gap-1 border transition active:scale-[.98]";
  const btnTone = theme === "dark" ? "border-neutral-800 hover:bg-neutral-800/70" : "border-neutral-200 hover:bg-neutral-50";
  const activeTone = theme === "dark" ? "bg-neutral-800" : "bg-neutral-100";
  const iconBtnBase =
    "h-9 w-9 rounded-md inline-flex items-center justify-center border transition active:scale-[.98] " +
    (theme === "dark" ? "border-neutral-800 hover:bg-neutral-800/70" : "border-neutral-200 hover:bg-neutral-50");
  const iconClass = "h-8 w-8";

  const TextBtn: React.FC<{ title: string; active?: boolean; disabled?: boolean; onClick: () => void }> = ({
    title, active = false, disabled = false, onClick, children,
  }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[btnBase, btnTone, active ? activeTone : "", disabled ? "opacity-40 cursor-not-allowed" : ""].join(" ")}
    >
      {children}
    </button>
  );

  const IconBtn: React.FC<{ title: string; src: string; active?: boolean; onClick: () => void; disabled?: boolean }> = ({
    title, src, active = false, onClick, disabled = false,
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[iconBtnBase, active ? activeTone : "", disabled ? "opacity-40 cursor-not-allowed" : ""].join(" ")}
    >
      <img src={src} alt={title} className={iconClass} />
    </button>
  );

  const Sep = () => <span className={theme === "dark" ? "mx-1 h-5 w-px bg-neutral-800" : "mx-1 h-5 w-px bg-neutral-200"} />;

  const setBlock = (type: string) => {
    const c = editor.chain().focus();
    switch (type) {
      case "p": c.setParagraph().run(); break;
      case "h1": c.toggleHeading({ level: 1 }).run(); break;
      case "h2": c.toggleHeading({ level: 2 }).run(); break;
      case "h3": c.toggleHeading({ level: 3 }).run(); break;
      case "quote": c.toggleBlockquote().run(); break;
      case "code": c.toggleCodeBlock().run(); break;
    }
  };

  const insertLink = () => {
    const prev = editor.getAttributes("link")?.href as string | undefined;
    const href = window.prompt("링크 URL을 입력하세요", prev || "https://");
    if (href === null) return;
    if (href === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href }).run();
  };

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        if (src) editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const url = URL.createObjectURL(file);
      editor.chain().focus().insertContent(
        `<a href="${url}" download="${file.name}" target="_blank" rel="noopener">${file.name}</a>`
      ).run();
    };
    input.click();
  };

  const insertVideo = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "video/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        editor.chain().focus().insertContent(
          `<video controls src="${url}" style="max-width:100%;border-radius:8px;"></video>`
        ).run();
        return;
      }
      const link = window.prompt("동영상 URL(YouTube iframe 또는 mp4 링크)을 입력하세요");
      if (!link) return;
      const isIframe = link.includes("<iframe");
      const html = isIframe ? link : `<video controls src="${link}" style="max-width:100%;border-radius:8px;"></video>`;
      editor.chain().focus().insertContent(html).run();
    };
    input.click();
  };

  return (
    <>
      <div className={["rounded-xl px-3 py-2 flex flex-wrap items-center gap-2", tone].join(" ")}>
        {/* 블록 타입 */}
        <select
          className={[
            "h-9 rounded-md border px-2 text-sm",
            theme === "dark" ? "bg-neutral-900 border-neutral-800 text-neutral-100" : "bg-white border-neutral-200 text-neutral-900",
          ].join(" ")}
          value={
            editor.isActive("heading", { level: 1 }) ? "h1"
            : editor.isActive("heading", { level: 2 }) ? "h2"
            : editor.isActive("heading", { level: 3 }) ? "h3"
            : editor.isActive("blockquote") ? "quote"
            : editor.isActive("codeBlock") ? "code" : "p"
          }
          onChange={(e) => setBlock(e.target.value)}
          title="블록 타입"
        >
          <option value="p">본문</option>
          <option value="h1">제목 1</option>
          <option value="h2">제목 2</option>
          <option value="h3">제목 3</option>
          <option value="quote">인용</option>
          <option value="code">코드</option>
        </select>

        <Sep />

        {/* 텍스트 */}
        <TextBtn title="굵게"   active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></TextBtn>
        <TextBtn title="기울임" active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></TextBtn>
        <TextBtn title="밑줄"   active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></TextBtn>
        <TextBtn title="취소선" active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="line-through">S</span>
        </TextBtn>

        <Sep />

        {/* 정렬 */}
        <IconBtn title="왼쪽 정렬"   src="/icons/좌측.png"    active={editor.isActive({ textAlign: "left"   })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
        <IconBtn title="가운데 정렬" src="/icons/가운데.png"  active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
        <IconBtn title="오른쪽 정렬" src="/icons/우측.png"    active={editor.isActive({ textAlign: "right"  })} onClick={() => editor.chain().focus().setTextAlign("right").run()} />

        <Sep />

        {/* 목록 */}
        <IconBtn title="글머리 기호" src="/icons/글머리 기호.png" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <TextBtn title="번호 목록" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</TextBtn>
        <TextBtn title="할 일 목록" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</TextBtn>

        <Sep />

        {/* 삽입 */}
        <IconBtn title="링크"     src="/icons/링크.png"     onClick={insertLink} />
        <IconBtn title="사진"     src="/icons/사진.png"     onClick={insertImage} />
        <IconBtn title="파일 추가" src="/icons/파일추가.png" onClick={insertFile} />
        <IconBtn title="동영상"   src="/icons/동영상.png"   onClick={insertVideo} />
        <IconBtn title="표"       src="/icons/표.png"       onClick={() => setShowTableModal(true)} />

        {/* 녹음 */}
        <IconBtn title="녹음 시작" src="/icons/마이크.png" onClick={onOpenRecorder} />

        <div className="ml-auto" />

        {/* 되돌리기/다시 실행 */}
        <TextBtn title="되돌리기"   onClick={() => editor.chain().focus().undo().run()}>↶</TextBtn>
        <TextBtn title="다시 실행" onClick={() => editor.chain().focus().redo().run()}>↷</TextBtn>
      </div>

      {/* 표 전용 툴바 */}
      {tableBarOpen && editor.isActive("table") && (
        <div className={["mt-2 rounded-xl border px-3 py-2 flex flex-wrap items-center gap-2", tone].join(" ")}>
          <span className="text-sm opacity-60 mr-1">표 편집</span>
          <TextBtn title="행↑+" onClick={() => editor.chain().focus().addRowBefore().run()}>행↑+</TextBtn>
          <TextBtn title="행↓+" onClick={() => editor.chain().focus().addRowAfter().run()}>행↓+</TextBtn>
          <TextBtn title="행−"  onClick={() => editor.chain().focus().deleteRow().run()}>행−</TextBtn>
          <Sep />
          <TextBtn title="열←+" onClick={() => editor.chain().focus().addColumnBefore().run()}>열←+</TextBtn>
          <TextBtn title="열→+" onClick={() => editor.chain().focus().addColumnAfter().run()}>열→+</TextBtn>
          <TextBtn title="열−"  onClick={() => editor.chain().focus().deleteColumn().run()}>열−</TextBtn>
          <Sep />
          <TextBtn title="헤더"  onClick={() => editor.chain().focus().toggleHeaderRow().run()}>헤더</TextBtn>
          <TextBtn title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()}>표 삭제</TextBtn>
        </div>
      )}

      {/* 표 만들기 모달 */}
      {showTableModal && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px] flex items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setShowTableModal(false); }}
          >
            <div
              className={`rounded-xl border w-[360px] max-w-[90vw] bg-white p-5 shadow-2xl ${
                theme === "dark" ? "text-neutral-100 bg-neutral-900 border-neutral-800" : ""
              }`}
              role="dialog" aria-modal="true"
            >
              <h3 className="text-lg font-semibold">표 만들기</h3>
              <div className="mt-4 space-y-3">
                <label className="flex items-center justify-between">
                  <span>행 개수</span>
                  <input type="number" min={1} value={rows}
                    onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24 rounded-md border px-2 py-1" />
                </label>
                <label className="flex items-center justify-between">
                  <span>열 개수</span>
                  <input type="number" min={1} value={cols}
                    onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24 rounded-md border px-2 py-1" />
                </label>
                <label className="flex items-center gap-2 text-sm opacity-70 select-none">
                  <input type="checkbox" checked readOnly /> 헤더 행 포함 (기본)
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowTableModal(false)} className="h-9 px-3 rounded-md border">취소</button>
                <button
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                    setShowTableModal(false);
                  }}
                  className="h-9 px-3 rounded-md border bg-blue-600 text-white hover:bg-blue-700"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
