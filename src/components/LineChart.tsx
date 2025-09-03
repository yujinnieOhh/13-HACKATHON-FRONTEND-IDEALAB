// File: src/components/LineChart.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from "chart.js";
import { ENDPOINTS } from "@/lib/endpoints";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

type Point = { time?: string; label?: string; value: number };

type Props = {
  /** 이미 계산된 데이터를 전달하는 모드 (권장: RightTabEmbed에서 사용) */
  data?: Point[];
  /** 백엔드 호출 모드용 옵션 */
  gu?: string;
  category?: string;
  /** 커스텀 API URL을 직접 지정 (지정 시 gu/category 무시) */
  endpoint?: string;
  title?: string;
};

function makeDemo(): Point[] {
  const slots = ["00~06시", "06~09시", "09~12시", "12~15시", "15~18시", "18~21시", "21~24시"];
  return slots.map((t) => ({ time: t, value: Math.round(5 + Math.random() * 20) }));
}

export default function LineChart({
  data,
  gu = "서대문구",
  category = "음식점업",
  endpoint,
  title = "시간대별 매출 현황",
}: Props) {
  const [rows, setRows] = useState<Point[]>(data ?? []);
  const [loading, setLoading] = useState<boolean>(!data);
  const [err, setErr] = useState<string>("");

  // fetch가 필요한지 판단
  const shouldFetch = useMemo(() => {
    if (data && data.length) return false;
    if (endpoint) return true;
    // ENDPOINTS.analytics.timeSales가 함수일 때만 사용
    return typeof (ENDPOINTS as any)?.analytics?.timeSales === "function";
  }, [data, endpoint]);

  useEffect(() => {
    if (!shouldFetch) {
      // data prop 사용 or 호출 수단 없음 → 데모로 보장
      if (!data || !data.length) setRows(makeDemo());
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const url =
          endpoint ??
          // 함수형이면 호출 (문자열이면 사용하지 않음)
          ((ENDPOINTS as any).analytics.timeSales as (g: string, c: string) => string)(gu, category);

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // 응답은 [{ time: string, value: number }, ...] 가정
        const json = (await res.json()) as Point[] | null;
        setRows(Array.isArray(json) ? json : []);
      } catch (e: any) {
        console.warn("[LineChart] fetch error:", e);
        setErr(e?.message || "데이터 불러오기 실패");
        // 로컬/오프라인에서도 보이도록 데모로 폴백
        setRows(makeDemo());
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, endpoint, gu, category]);

  if (loading) return <p className="text-sm text-neutral-500">시간대 매출 데이터를 불러오는 중…</p>;

  if (!rows.length) return <p className="text-sm text-neutral-500">데이터 없음</p>;

  const labels = rows.map((r) => r.time ?? r.label ?? "");
  const values = rows.map((r) => r.value ?? 0);

  const chartData = {
    labels,
    datasets: [
      {
        fill: true,
        label: "시간대별 매출 비율(%)",
        data: values,
        borderColor: "rgb(53, 162, 235)",
        backgroundColor: "rgba(53, 162, 235, 0.5)",
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: title },
      tooltip: { enabled: true },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <div>
      {err && <p className="mb-2 text-xs text-amber-600">참고: {err} (로컬 데모로 표시)</p>}
      <Line options={chartOptions as any} data={chartData as any} />
    </div>
  );
}
