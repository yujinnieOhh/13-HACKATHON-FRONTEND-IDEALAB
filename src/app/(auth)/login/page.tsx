// src/app/(auth)/login/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { ENDPOINTS } from "@/lib/endpoints";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();

  // ✅ 기본 리다이렉트 경로를 /ws 로 변경
  const rawNext = sp.get("next");
  const next = rawNext && rawNext.startsWith("/") ? rawNext : "/ws";

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");

    try {
      const r = await fetch(ENDPOINTS.login, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 세션/쿠키 기반이라면 주석 해제 (백엔드 CORS/credentials 설정 필요)
        // credentials: "include",
        body: JSON.stringify({ email, password: pw }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok) {
        const msg =
          j?.message ||
          j?.detail ||
          (Array.isArray(j?.non_field_errors) && j.non_field_errors[0]) ||
          `로그인 실패 (HTTP ${r.status})`;
        setErr(msg);
        setLoading(false);
        return;
      }

      // JWT 토큰을 내려주는 백엔드라면 저장
      const access = j?.access || j?.token;
      if (access) localStorage.setItem("access_token", access);

      // ✅ 성공 시 워크스페이스 홈(/ws) 또는 ?next= 로 이동
      router.replace(next);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="email"
        className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="이메일"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="비밀번호"
        autoComplete="current-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
      />

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="w-[420px] rounded-2xl bg-white p-8 shadow-lg">
        {/* 로고 */}
        <div className="flex items-center justify-center mb-8">
          <img src="/logos/IDEAL.png" className="h-8" alt="IDEA" />
          <img src="/logos/Lab.png" className="h-8 -ml-5 relative z-10" alt="Lab" />
        </div>

        {/* 로그인 폼 */}
        <Suspense fallback={<div>로딩 중...</div>}>
          <LoginForm />
        </Suspense>

        {/* 회원가입 링크 */}
        <div className="mt-5 text-center text-sm text-neutral-600">
          계정이 없나요?{" "}
          <a href="/signup" className="text-blue-600 hover:underline">
            회원가입
          </a>
        </div>
      </div>
    </div>
  );
}
