// File: src/components/MapsGraphs.tsx
"use client";

import { useEffect, useState, useMemo, JSX } from "react";
import { Map, Polygon } from "react-kakao-maps-sdk";
import { ENDPOINTS } from "@/lib/endpoints";

type GuArg = string | { name?: string; sig?: string; sigungu_cd?: string };

interface MapData {
  center: { lat: number; lng: number };
  bounds: any;
  polygons: JSX.Element[];
}

/* ───────── 유틸: 구 이름→코드, selectedGu 정규화 ───────── */
function guNameToCode(guName: string): string {
  const guCodeMap: Record<string, string> = {
    종로구: "11110",
    중구: "11140", // 서울 '중구'
    용산구: "11170",
    성동구: "11200",
    광진구: "11215",
    동대문구: "11230",
    중랑구: "11260",
    성북구: "11290",
    강북구: "11305",
    도봉구: "11320",
    노원구: "11350",
    은평구: "11380",
    서대문구: "11410",
    마포구: "11440",
    양천구: "11470",
    강서구: "11500",
    구로구: "11530",
    금천구: "11545",
    영등포구: "11560",
    동작구: "11590",
    관악구: "11620",
    서초구: "11650",
    강남구: "11680",
    송파구: "11710",
    강동구: "11740",
  };
  return guCodeMap[guName] || guName || "";
}

/** 문자열/객체 어떤 형태로 와도 {name, code}로 통일 */
function normalizeSelectedGu(arg: GuArg): { name: string; code: string } {
  if (typeof arg === "string") {
    const name = arg;
    const code = guNameToCode(name); // '중구'도 11140(서울)로 매핑
    return { name, code };
  }
  const name = arg?.name || "";
  const code = arg?.sig || arg?.sigungu_cd || (name ? guNameToCode(name) : "");
  return { name: name || code, code: code || "" };
}

/** GeoJSON geometry에서 외곽 링들만 추출 (Polygon/MultiPolygon 모두) */
function extractRings(geometry: any): number[][][] {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  if (!coordinates) return [];

  // Polygon: [ [ [lng,lat] ... ] , [hole...] ... ]
  if (type === "Polygon") {
    // 외곽 링(0번째)만
    return coordinates[0] ? [coordinates[0]] : [];
  }
  // MultiPolygon: [ [ [ [lng,lat] ... ] , [hole...] ... ], [ ... ] ... ]
  if (type === "MultiPolygon") {
    return (coordinates as any[])
      .map((poly) => (Array.isArray(poly) && poly[0] ? poly[0] : null))
      .filter(Boolean) as number[][][];
  }
  return [];
}

/* ───────── 컴포넌트 ───────── */
export default function MapsGraphs({ selectedGu }: { selectedGu: GuArg }) {
  const [sigData, setSigData] = useState<any>(null); // 행정구 경계 GeoJSON
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);

  const { name: guName, code: guCode } = useMemo(
    () => normalizeSelectedGu(selectedGu),
    [selectedGu]
  );

  // 1) GeoJSON 불러오기 (백엔드 우선, 실패하면 public/SIG.json fallback)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        let url =
          (ENDPOINTS as any)?.regions?.sig ||
          (typeof ENDPOINTS === "object" ? (ENDPOINTS as any).regions?.sig : "");

        let res: Response | null = null;
        if (url) {
          try {
            res = await fetch(url, { signal: ac.signal, mode: "cors", cache: "no-store" });
          } catch {
            // ignore → fallback
          }
        }
        if (!res || !res.ok) {
          res = await fetch("/SIG.json", { signal: ac.signal, cache: "no-store" });
        }
        const data = await res.json();
        setSigData(data);
      } catch (e) {
        console.error("Failed to fetch region data", e);
      }
    })();
    return () => ac.abort();
  }, []);

  // 2) 카카오맵 로드 체크
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).kakao?.maps) {
        (window as any).kakao.maps.load(() => setIsLoaded(true));
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // 3) 선택된 구에 맞춰 폴리곤 구성
  useEffect(() => {
    if (!isLoaded || !sigData || (!guName && !guCode)) return;

    const features: any[] = sigData?.features || [];
    const feature = features.find((f) => {
      const cd = f?.properties?.SIG_CD;
      const nm = f?.properties?.SIG_KOR_NM;
      // 코드가 있으면 코드 우선, 없으면 이름으로 매칭
      return (guCode && cd === guCode) || (!!guName && nm === guName);
    });

    if (!feature) {
      console.error(`${guName || guCode} 에 해당하는 지역 데이터를 찾을 수 없습니다.`);
      return;
    }

    const rings = extractRings(feature.geometry);
    if (!rings.length) return;

    // 모든 포인트를 LatLng로 변환
    const paths = rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));

    // 중심/범위 계산
    let sumLat = 0,
      sumLng = 0,
      cnt = 0;
    paths.forEach((ring) =>
      ring.forEach((p) => {
        sumLat += p.lat;
        sumLng += p.lng;
        cnt++;
      })
    );
    const center = { lat: sumLat / cnt, lng: sumLng / cnt };

    const bounds = new (window as any).kakao.maps.LatLngBounds();
    paths.forEach((ring) =>
      ring.forEach((p) => bounds.extend(new (window as any).kakao.maps.LatLng(p.lat, p.lng)))
    );

    const polygons = paths.map((path, idx) => (
      <Polygon
        key={`${guCode || guName}-${idx}`}
        path={path}
        strokeWeight={3}
        strokeColor="#ff0000"
        strokeOpacity={1}
        fillColor="#ff0000"
        fillOpacity={0.2}
      />
    ));

    setMapData({ center, bounds, polygons });
  }, [isLoaded, sigData, guName, guCode]);

  if (!mapData) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>지도를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen">
      <Map
        center={mapData.center}
        // bounds={mapData.bounds} // 필요 시 주석 해제하면 영역에 맞춰 자동 줌/센터
        style={{ width: "100%", height: "100%" }}
        level={7}
      >
        {mapData.polygons}
      </Map>
    </div>
  );
}
