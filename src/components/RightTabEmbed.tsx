// File: src/components/RightTabEmbed.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import MapsGraphs from "@/components/MapsGraphs";
import GuSelect from "@/components/GuSelect";
import CategorySelector from "@/components/CategorySelect";
import PieChart from "@/components/PieChart";
import LineChart from "@/components/LineChart";
import BarChart from "@/components/BarChart";
import { useInsightStore } from "@/store/insight";
import { ENDPOINTS } from "@/lib/endpoints";

/* ───────── 타입 ───────── */
type ChartItem = { label: string; value: number };
type AiReco = { name: string; gu: string };

type SummBlk = { heading: string; paragraph: string };
type Summary = {
  day?: SummBlk;
  gender?: SummBlk & { highlightLabel?: string; highlightValue?: number };
  time?: SummBlk;
  age?: SummBlk;
};

type Props = {
  backendGu?: string;
  className?: string;
};

/* ───────── 유틸 ───────── */
function guNameToCode(guName: string): string {
  const guCodeMap: Record<string, string> = {
    종로구: "11110", 중구: "11140", 용산구: "11170", 성동구: "11200", 광진구: "11215",
    동대문구: "11230", 중랑구: "11260", 성북구: "11290", 강북구: "11305", 도봉구: "11320",
    노원구: "11350", 은평구: "11380", 서대문구: "11410", 마포구: "11440", 양천구: "11470",
    강서구: "11500", 구로구: "11530", 금천구: "11545", 영등포구: "11560", 동작구: "11590",
    관악구: "11620", 서초구: "11650", 강남구: "11680", 송파구: "11710", 강동구: "11740",
  };
  return guCodeMap[guName] || guName;
}

function withQuery(base: string, params: Record<string, string | undefined>) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const u = new URL(base, origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, v);
  });
  return u.toString();
}

const DEMO_MODE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RIGHTTAB_DEMO === "1") ||
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1");

function makeDemo(selectedGu: string) {
  const mk = (labels: string[]) =>
    labels.map((l) => ({ label: l, value: Math.round(20 + Math.random() * 80) }));

  return {
    charts: {
      genderSales: mk(["남성", "여성"]),
      timeSales: mk(["09시", "12시", "15시", "18시", "21시"]),
      ageSales: mk(["10대", "20대", "30대", "40대", "50대+"]),
      daySales: mk(["월", "화", "수", "목", "금", "토", "일"]),
    },
    summaries: {
      day: { heading: `${selectedGu} 요일 매출 인사이트`, paragraph: "주말에 매출이 높게 형성됩니다." },
      gender: { heading: "성별 매출 인사이트", paragraph: "여성 비중이 소폭 높습니다." },
      time: { heading: "시간대 매출 인사이트", paragraph: "저녁 시간대에 매출이 집중됩니다." },
      age: { heading: "연령대 매출 인사이트", paragraph: "20–30대가 주 고객층입니다." },
    },
    aiRecommendations: [
      { name: "핫플 구 이동", gu: "마포구" },
      { name: "상권 비교", gu: "강남구" },
    ],
  };
}

export default function RightTabEmbed({ backendGu, className }: Props) {
  const selectedRegion = useInsightStore((s) => s.selectedRegion);
  const setGlobalRegion = useInsightStore((s) => s.setRegion);

  const [selectedGu, setSelectedGu] = useState<string>(backendGu || "서대문구");
  const [selections, setSelections] = useState<Record<string, string | null>>({});

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [genderData, setGenderData] = useState<ChartItem[] | null>(null);
  const [timeData, setTimeData] = useState<ChartItem[] | null>(null);
  const [ageData, setAgeData] = useState<ChartItem[] | null>(null);
  const [dayData, setDayData] = useState<ChartItem[] | null>(null);
  const [summary, setSummary] = useState<Summary>({});
  const [aiGeneratedButton, setAiGeneratedButton] = useState<AiReco[]>([]);

  const [maxAgeItem, setMaxAgeItem] = useState<ChartItem | null>(null);
  const [maxDayItem, setMaxDayItem] = useState<ChartItem | null>(null);
  const [maxTimeItem, setMaxTimeItem] = useState<ChartItem | null>(null);

  const [year] = useState<string>(String(new Date().getFullYear()));
  const yyq = useMemo(() => {
    const m = new Date().getMonth() + 1;
    const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
    return `${year}${q}`;
  }, [year]);

  useEffect(() => {
    if (selectedRegion && selectedRegion !== selectedGu) {
      setSelectedGu(selectedRegion);
    }
  }, [selectedRegion, selectedGu]);

  const mainCategory = useMemo<string>(() => {
    const first = Object.values(selections).find(Boolean);
    return (first as string) || "음식점업";
  }, [selections]);

  // ✅ 여기: MapsGraphs에 넘길 객체형 값으로 변환
  const selectedGuObj = useMemo(
    () => ({ name: selectedGu, sig: guNameToCode(selectedGu) }),
    [selectedGu]
  );

  useEffect(() => {
    const ac = new AbortController();

    const applyData = (data: any) => {
      const g: ChartItem[] | null = data?.charts?.genderSales ?? null;
      const t: ChartItem[] | null = data?.charts?.timeSales ?? null;
      const a: ChartItem[] | null = data?.charts?.ageSales ?? null;
      const d: ChartItem[] | null = data?.charts?.daySales ?? null;

      setGenderData(g);
      setTimeData(t);
      setAgeData(a);
      setDayData(d);
      setSummary(data?.summaries ?? {});
      setAiGeneratedButton(Array.isArray(data?.aiRecommendations) ? data.aiRecommendations : []);

      const maxOf = (arr: ChartItem[] | null) =>
        arr && arr.length ? arr.reduce((m, c) => (c.value > m.value ? c : m)) : null;

      setMaxAgeItem(maxOf(a));
      setMaxDayItem(maxOf(d));
      setMaxTimeItem(maxOf(t));
    };

    const fetchWithFallback = async () => {
      setIsLoading(true);

      if (DEMO_MODE) {
        applyData(makeDemo(selectedGu));
        setIsLoading(false);
        return;
      }

      const code = guNameToCode(selectedGu);
      const remoteBase = ENDPOINTS?.analytics?.industryMetrics || "";

      if (remoteBase) {
        try {
          const url1 = withQuery(remoteBase, { signgu_cd: code, sigungu_cd: code, yyq });
          const r1 = await fetch(url1, { signal: ac.signal, cache: "no-store" });
          if (r1.ok) {
            applyData(await r1.json());
            setIsLoading(false);
            return;
          }
        } catch {}

      }
      try {
        const url2 = withQuery("/api/analytics/industry-metrics", { signgu_cd: code, sigungu_cd: code, yyq });
        const r2 = await fetch(url2, { signal: ac.signal, cache: "no-store" });
        if (r2.ok) {
          applyData(await r2.json());
          setIsLoading(false);
          return;
        }
      } catch {}

      applyData(makeDemo(selectedGu));
      setIsLoading(false);
    };

    if (selectedGu && mainCategory) {
      fetchWithFallback();
    }

    return () => ac.abort();
  }, [selectedGu, mainCategory, yyq]);

  if (isLoading) return <div className={className}>데이터를 불러오는 중입니다…</div>;
  if (!genderData || !timeData || !ageData || !dayData)
    return <div className={className}>표시할 데이터가 없습니다.</div>;

  return (
    <div className={`flex flex-col h-full ${className || ""}`}>
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-6 pt-0 pb-3 border-b">
        <div className="flex flex-row items-center gap-2">
          <p className="text-[14px] text-[#A5A6B9]">AI 정보 제공</p>
          <Image src="/aiInfo.svg" height={20} width={20} alt="안내" />
          <Image src="/aiInformation.png" height={17} width={500} alt="AI 정보 안내" />
        </div>

        <div className="flex flex-row gap-2 pt-3">
          {aiGeneratedButton.map((b) => (
            <button
              key={`${b.name}-${b.gu}`}
              onClick={() => {
                setSelectedGu(b.gu);
                setGlobalRegion(b.gu);
              }}
              className={`px-3 py-2 h-10 rounded-lg border ${
                selectedGu === b.gu ? "bg-[#0472DE] text-white" : "bg-white text-[#0472DE]"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <div className="pt-3 flex flex-row gap-2">
          <div className="relative z-20">
            <GuSelect
              selectedGu={selectedGu}
              onGuChange={(gu) => {
                setSelectedGu(gu);
                setGlobalRegion(gu);
              }}
            />
          </div>
          <div className="flex items-start justify-center">
            <CategorySelector selections={selections} onSelectionChange={setSelections} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-7">
          {/* ✅ 객체형으로 전달 */}
          <MapsGraphs selectedGu={selectedGuObj} />
        </div>

        <div className="px-8 pb-8">
          <div className="flex flex-col gap-8">
            <div className="p-4 border rounded-lg">
              <h2 className="text-xl font-bold text-blue-600 mb-2">{summary.day?.heading}</h2>
              <p className="text-sm bg-blue-50 p-3 rounded-md mb-4">{summary.day?.paragraph}</p>
              <BarChart data={dayData} highlightLabel={maxDayItem?.label} title="요일별 매출 현황" />
            </div>

            <div className="p-4 border rounded-lg">
              <h2 className="text-xl font-bold text-blue-600 mb-2">{summary.gender?.heading}</h2>
              <p className="text-sm bg-blue-50 p-3 rounded-md mb-4">{summary.gender?.paragraph}</p>
              <PieChart data={genderData} />
            </div>

            <div className="p-4 border rounded-lg">
              <h2 className="text-xl font-bold text-blue-600 mb-2">{summary.time?.heading}</h2>
              <p className="text-sm bg-blue-50 p-3 rounded-md mb-4">{summary.time?.paragraph}</p>
              <LineChart data={timeData} />
            </div>

            <div className="p-4 border rounded-lg">
              <h2 className="text-xl font-bold text-blue-600 mb-2">{summary.age?.heading}</h2>
              <p className="text-sm bg-blue-50 p-3 rounded-md mb-4">{summary.age?.paragraph}</p>
              <BarChart data={ageData} highlightLabel={maxAgeItem?.label} title="연령대별 매출 현황" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
