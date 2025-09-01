// src/app/(app)/ws/page.tsx  (또는 사용 중인 경로 그대로)
"use client";

export default function WorkspaceHome() {
  return (
    <div className="flex-1 min-w-0">
      {/* 상단 헤더 (필요 없으면 제거) */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur h-14" />

      {/* 본문: 가운데 로고 락업 + 안내 */}
      <div className="h-[calc(100vh-56px)] w-full flex items-center justify-center px-4">
        <div className="text-center select-none">
          {/* 로고 락업: (메인로고)  아이디어  +  랩 */}
          <div className="inline-flex items-center gap-3">
            <img
              src="/logos/메인로고.png"
              alt="IDEALab 메인로고"
              className="h-16 w-auto md:h-20"
            />
            <img
              src="/logos/image 90.png"
              alt="아이디어"
              className="h-8 w-auto md:h-14"
            />

           
            <img
              src="/logos/image 91.png"
              alt="랩"
              className="h-8 w-auto md:h-14 -ml-11 relative z-10"
            />
          </div>

          <p className="mt-6 text-neutral-500">
            왼쪽에서 폴더/파일을 선택하거나,{" "}
            <span className="font-medium text-neutral-700">+ 새 프로젝트 만들기</span>
            로 시작하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
