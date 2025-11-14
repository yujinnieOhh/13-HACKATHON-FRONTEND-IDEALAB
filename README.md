# IDEALab (아이디어랩)

> 창업자를 위한 AI 기반 실시간 상권 분석 및 협업 툴 (멋쟁이사자처럼 중앙 해커톤)

<br />


## 📌 주요 기능

* **AI 실시간 상권 분석:**
    * 회의 중 사용자가 '지역명'을 언급하면, 해당 지역의 핵심 상권 분석 데이터를 실시간으로 제공.
* **AI 최종 레포트 (핵심 기능):**
    * 사용자가 선택한 '구'와 '업종'에 따라 AI가 분석한 상권 데이터를 종합 리포트 형식으로 제공.
* **지도 시각화 (Kakao Maps):**
    * `react-kakao-maps-sdk`를 활용, 선택된 '구'의 행정 경계(`GeoJSON`)를 지도 위에 `Polygon` 오버레이로 렌더링.
* **데이터 차트 (Chart.js):**
    * AI가 분석한 데이터를 `react-chartjs-2`를 활용해 4가지 차트로 시각화.
        * **Bar Chart (2종):** 요일별 매출 현황, 연령대별 매출 현황
        * **Line Chart (1종):** 시간대별 매출 현황
        * **Pie Chart (1종):** 성별 매출 현황
* **동적 컨트롤:**
    * **지역 선택:** `GuSelect` 컴포넌트를 통해 사용자가 분석할 '구'를 선택.
    * **업종 선택:** `CategorySelector` 컴포넌트를 통해 '음식점업', '도소매업' 등 대분류/소분류 업종 필터링.

<br />

## 🛠️ 기술 스택

* **Frontend:** Next.js (App Router), React, TypeScript
* **Styling:** Tailwind CSS
* **State Management:** Zustand (`useInsightStore`)
* **API Client:** `fetch` API (Native)
* **Data Visualization:** `react-chartjs-2`, `react-kakao-maps-sdk`
* **Deployment:** Vercel

<br />

## 💡 핵심 트러블슈팅 및 설계

* **지도 데이터 파싱 및 렌더링:**
    * **문제:** `react-kakao-maps-sdk`는 `Polygon` 경로로 단순 `lat/lng` 배열만 지원하나, 행정 경계 데이터는 복잡한 `GeoJSON` (feat. `MultiPolygon`) 형식.
    * **해결:** `SIG.json` 파일을 `fetch`로 비동기 로드한 후, `extractRings` 유틸 함수를 직접 구현하여 `MultiPolygon`을 포함한 `GeoJSON`의 `geometry` 데이터에서 `Polygon`이 인식할 수 있는 외곽 링(`[lng, lat]`) 배열만 추출하여 지도에 성공적으로 렌더링.
* **재사용 가능한 차트 컴포넌트 설계:**
    * **문제:** 4종의 차트(Bar, Line, Pie)가 각각 다른 API 엔드포인트와 데이터 형식을 가짐.
    * **해결:** `BarChart`, `LineChart` 등 범용 차트 컴포넌트를 설계. `props`로 `data`를 직접 주입받거나 `endpoint` URL만 받아 컴포넌트 내부에서 `useEffect`로 데이터를 직접 `fetch`하는 두 가지 모드를 모두 지원. 또한, `makeDemo` 폴백(fallback) 함수를 구현하여 API 호출 실패 시에도 데모 데이터로 UI가 깨지지 않도록 안정성 확보.
* **Zustand를 통한 전역 상태 관리:**
    * **문제:** `GuSelect` (지역 선택기), `MapsGraphs` (지도), `RightTabEmbed` (리포트 본문) 등 여러 컴포넌트가 '현재 선택된 구(`selectedGu`)' 상태를 공유해야 함.
    * **해결:** `React Context` 대신 가볍고 보일러플레이트가 적은 `Zustand`를 도입. `useInsightStore` 스토어를 생성하여, 사용자가 `GuSelect`에서 '구'를 변경하면 `setRegion` 액션이 스토어 상태를 업데이트하고, 이 스토어를 구독하는 모든 컴포넌트(지도, 차트)가 리렌더링 없이 즉각적으로 동기화되도록 설계.
