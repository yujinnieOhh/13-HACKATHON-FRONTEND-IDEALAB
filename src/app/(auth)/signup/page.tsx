"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ENDPOINTS } from "@/lib/endpoints";

type ServerError =
  | { message?: string; detail?: string; non_field_errors?: string[] }
  | Record<string, string[]>
  | string
  | null
  | undefined;

function pickErrorMessage(e: ServerError, fallback: string) {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  if (e.message) return e.message;
  if (e.detail) return e.detail;
  if (Array.isArray(e.non_field_errors) && e.non_field_errors[0]) {
    return e.non_field_errors[0];
  }
  const k = Object.keys(e)[0];
  if (k && Array.isArray((e as any)[k]) && (e as any)[k][0]) {
    return `${k}: ${(e as any)[k][0]}`;
  }
  return fallback;
}

export default function SignupPage() {
  const router = useRouter();

  // form state
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  // ui state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // client validations
  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const pwStrong = useMemo(() => pw.length >= 8, [pw]); // 8자 권장
  const samePw = pw === pw2;
  const canSubmit =
    emailValid && pwStrong && samePw && !!name && !!nickname && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!samePw) {
      setErr("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      // 서버가 기대하는 4개 필드만 전송
      const payload = { email, password: pw, name, nickname };

      const res = await fetch(ENDPOINTS.signup, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 세션/쿠키 인증이면 ↓ 주석 해제 + CORS/CSRF 세팅 필요
        // credentials: "include",
        body: JSON.stringify(payload),
      });

      // 응답이 JSON이 아닐 수도 있어 방어적으로 처리
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // JSON이 아니면 그대로 보여주기 위해 둠
      }

      if (!res.ok) {
        console.log("Signup error:", res.status, raw); // 원문 확인
        setErr(pickErrorMessage(data, `회원가입 실패 (HTTP ${res.status})`));
        return;
      }

      // 성공 시 로그인 페이지로
      router.replace("/login");
    } catch (e) {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="w-[420px] rounded-2xl bg-white p-8 shadow-lg">
        <h2 className="text-center text-2xl font-semibold mb-6">회원가입</h2>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-3">
            <input
              className="w-1/2 rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="w-1/2 rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="별명"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
          </div>

          <input
            type="email"
            className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="이메일 (you@example.com)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="비밀번호 (8자 이상)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={8}
          />

          <input
            type="password"
            className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            minLength={8}
          />

          {err && <p className="text-sm text-red-600">{err}</p>}

          <label className="flex items-center text-sm text-neutral-700">
            <input type="checkbox" required className="mr-2" /> 개인정보 수집 및
            이용에 동의합니다.
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "처리 중..." : "가입 완료"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-neutral-600">
          이미 계정이 있나요?{" "}
          <a href="/login" className="text-blue-600 hover:underline">
            로그인
          </a>
        </div>
      </div>
    </div>
  );
}
