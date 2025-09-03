// File: src/components/PieChart.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { ENDPOINTS } from "@/lib/endpoints";

ChartJS.register(ArcElement, Tooltip, Legend);

type ChartItem = { label: string; value: number };
type GenderSalesKV = { female?: number; male?: number };

type Props = {
  /** 이미 계산된 데이터를 전달하는 모드 (RightTabEmbed에서 사용) */
  data?: ChartItem[];

  /** 아래는 컴포넌트가 직접 API를 호출하는 모드에서 사용 */
  gu?: string;
  category?: string;
  /** 커스텀 endpoint URL (지정 시 gu/category 무시) */
  endpoint?: string;

  title?: string;
};

function makeDemo(): ChartItem[] {
  const female = Math.round(45 + Math.random() * 20); // 45~65
  const male = 100 - female;
  return [
    { label: "여성", value: female },
    { label: "남성", value: male },
  ];
}

export default function PieChart({
  data,
  gu = "서대문구",
  category = "음식점업",
  endpoint,
  title = "성별 매출 현황",
}: Props) {
  const [rows, setRows] = useState<ChartItem[]>(data ?? []);
  const [loading, setLoading] = useState<boolean>(!data);
  const [err, setErr] = useState<string>("");

  // fetch 필요 여부 판단
  const shouldFetch = useMemo(() => {
    if (data && data.length) return false;
    if (endpoint) return true;
    return typeof (ENDPOINTS as any)?.analytics?.genderSales === "function";
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
          ((ENDPOINTS as any).analytics.genderSales as (g: string, c: string) => string)(
            gu,
            category
          );

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as GenderSalesKV | ChartItem[] | null;

        let parsed: ChartItem[] = [];
        if (Array.isArray(json)) {
          // [{label, value}] 형태인 경우
          parsed = json
            .map((x: any) => ({
              label: String(x?.label ?? x?.name ?? ""),
              value: Number(x?.value ?? 0),
            }))
            .filter((x) => x.label);
        } else if (json && (json.female != null || json.male != null)) {
          // { female, male } 형태인 경우
          const female = Number((json as GenderSalesKV).female ?? 0);
          const male = Number((json as GenderSalesKV).male ?? 0);
          parsed = [
            { label: "여성", value: female },
            { label: "남성", value: male },
          ];
        }

        setRows(parsed.length ? parsed : makeDemo());
      } catch (e: any) {
        console.warn("[PieChart] fetch error:", e);
        setErr(e?.message || "데이터 로드 실패");
        setRows(makeDemo()); // 로컬/오프라인에서도 표시
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, endpoint, gu, category]);

  if (loading) return <div className="text-sm text-neutral-500">성별 매출 불러오는 중…</div>;
  if (!rows.length) return <div className="text-sm text-neutral-500">데이터 없음</div>;

  const chartData = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        label: "성별 매출 (%)",
        data: rows.map((r) => r.value),
        backgroundColor: ["rgba(75, 192, 192, 0.6)", "rgba(54, 162, 235, 0.6)"],
        borderColor: ["rgba(75, 192, 192, 1)", "rgba(54, 162, 235, 1)"],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "right" as const },
      title: { display: true, text: title },
      tooltip: { enabled: true },
    },
  };

  return (
    <div>
      {err && <p className="mb-2 text-xs text-amber-600">참고: {err} (로컬 데모로 표시)</p>}
      <Pie data={chartData as any} options={chartOptions as any} />
    </div>
  );
}
