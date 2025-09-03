// File: src/components/BarChart.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type BarItem = { label: string; value: number };

type Props = {
  /** RightTabEmbed 등에서 이미 계산한 데이터를 바로 넘기는 모드 */
  data?: BarItem[];

  /** 컴포넌트가 직접 API를 호출할 때 사용할 절대/상대 URL */
  endpoint?: string;

  /** 차트 제목 */
  title?: string;

  /** 특정 라벨 강조(없으면 자동으로 최댓값 라벨 강조) */
  highlightLabel?: string;
};

function makeDemo(title?: string): BarItem[] {
  const rnd = () => Math.round(10 + Math.random() * 90);

  if (title?.includes("요일")) {
    return ["월", "화", "수", "목", "금", "토", "일"].map((d) => ({
      label: d,
      value: rnd(),
    }));
  }
  if (title?.includes("연령")) {
    return ["10대", "20대", "30대", "40대", "50대+"].map((a) => ({
      label: a,
      value: rnd(),
    }));
  }
  // generic
  return ["A", "B", "C", "D", "E"].map((l) => ({ label: l, value: rnd() }));
}

export default function BarChart({
  data,
  endpoint,
  title = "막대 차트",
  highlightLabel,
}: Props) {
  const [rows, setRows] = useState<BarItem[]>(data ?? []);
  const [loading, setLoading] = useState<boolean>(!data && !!endpoint);
  const [err, setErr] = useState<string>("");

  // fetch가 필요한지 판단
  const shouldFetch = useMemo(() => {
    if (data && data.length) return false;
    return !!endpoint;
  }, [data, endpoint]);

  useEffect(() => {
    if (!shouldFetch) {
      // 데이터가 이미 있거나 endpoint도 없으면 데모라도 보장
      if (!data || !data.length) setRows(makeDemo(title));
      setLoading(false);
      return;
    }

    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(endpoint!, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as any;

        // 허용 포맷: [{label, value}] 또는 [{name,value}] 또는 {labels:[], values:[]}
        let parsed: BarItem[] = [];
        if (Array.isArray(json)) {
          parsed = json
            .map((x) => ({
              label: String(x?.label ?? x?.name ?? ""),
              value: Number(x?.value ?? 0),
            }))
            .filter((x) => x.label);
        } else if (json && Array.isArray(json.labels) && Array.isArray(json.values)) {
          parsed = json.labels
            .map((l: any, i: number) => ({
              label: String(l),
              value: Number(json.values[i] ?? 0),
            }))
            .filter((x: BarItem) => x.label);
        }

        setRows(parsed.length ? parsed : makeDemo(title));
      } catch (e: any) {
        setErr(e?.message || "데이터 불러오기 실패");
        setRows(makeDemo(title)); // 로컬/오프라인 폴백
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [shouldFetch, endpoint, data, title]);

  if (loading) return <p className="text-sm text-neutral-500">막대 차트 데이터를 불러오는 중…</p>;
  if (!rows.length) return <p className="text-sm text-neutral-500">데이터 없음</p>;

  const autoHighlight =
    highlightLabel ||
    rows.reduce((max, cur) => (cur.value > max.value ? cur : max), rows[0]).label;

  const chartData = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        label: "값",
        data: rows.map((r) => r.value),
        backgroundColor: rows.map((r) =>
          r.label === autoHighlight ? "rgba(54, 162, 235, 0.8)" : "rgba(201, 203, 207, 0.8)"
        ),
        borderColor: rows.map((r) =>
          r.label === autoHighlight ? "rgba(54, 162, 235, 1)" : "rgba(201, 203, 207, 1)"
        ),
        borderWidth: 1,
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
      y: { beginAtZero: true },
    },
  };

  return (
    <div>
      {err && <p className="mb-2 text-xs text-amber-600">참고: {err} (로컬 데모로 표시)</p>}
      <Bar options={chartOptions as any} data={chartData as any} />
    </div>
  );
}
