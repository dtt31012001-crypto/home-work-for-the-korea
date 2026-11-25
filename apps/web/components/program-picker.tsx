"use client";

import { useState } from "react";

type Program = {
  key: "TH" | "KIIP";
  label: string;
  nameVi: string;
  nameKo: string;
  intro: string;
  levels: { code: string; name: string }[];
  note?: string;
};

const PROGRAMS: Program[] = [
  {
    key: "TH",
    label: "Tiếng Hàn tổng hợp",
    nameVi: "Tiếng Hàn tổng hợp dành cho người Việt Nam",
    nameKo: "베트남인을 위한 종합 한국어",
    intro: "Lộ trình 6 cấp từ sơ cấp đến cao cấp, rèn đều nghe – nói – đọc – viết, dành cho người Việt học tiếng Hàn.",
    levels: [
      { code: "TH01", name: "Sơ cấp 1" },
      { code: "TH02", name: "Sơ cấp 2" },
      { code: "TH03", name: "Trung cấp 1" },
      { code: "TH04", name: "Trung cấp 2" },
      { code: "TH05", name: "Cao cấp 1" },
      { code: "TH06", name: "Cao cấp 2" },
    ],
  },
  {
    key: "KIIP",
    label: "KIIP",
    nameVi: "Chương trình hội nhập xã hội Hàn Quốc",
    nameKo: "사회통합프로그램",
    intro: "Dành cho người chuẩn bị sinh sống tại Hàn Quốc: tiếng Hàn từ nhập môn đến trung cấp, sau đó là hiểu biết xã hội Hàn Quốc.",
    levels: [
      { code: "KIIP00", name: "Nhập môn" },
      { code: "KIIP01", name: "Sơ cấp 1" },
      { code: "KIIP02", name: "Sơ cấp 2" },
      { code: "KIIP03", name: "Trung cấp 1" },
      { code: "KIIP04", name: "Trung cấp 2" },
      { code: "KIIP05", name: "Hiểu biết xã hội Hàn Quốc" },
    ],
    note: "Chương trình KIIP do cơ quan Hàn Quốc quản lý; cấp độ ở đây để trung tâm sắp xếp lớp học.",
  },
];

/** Chọn nhanh hai chương trình: giới thiệu ngắn và các cấp độ (không mục lục bài). */
export function ProgramPicker() {
  const [active, setActive] = useState<Program["key"]>("TH");
  const p = PROGRAMS.find((x) => x.key === active)!;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <div role="tablist" aria-label="Chương trình học" className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
        {PROGRAMS.map((x) => (
          <button
            key={x.key}
            role="tab"
            id={`tab-${x.key}`}
            aria-selected={x.key === active}
            aria-controls={`panel-${x.key}`}
            onClick={() => setActive(x.key)}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${x.key === active ? "bg-surface text-brand-800 shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${p.key}`} aria-labelledby={`tab-${p.key}`} className="mt-5">
        <h3 className="text-lg font-semibold">{p.nameVi}</h3>
        <p lang="ko" className="text-sm text-muted">
          {p.nameKo}
        </p>
        <p className="mt-3 text-sm leading-relaxed">{p.intro}</p>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {p.levels.map((l) => (
            <li key={l.code} className="rounded-lg border border-line px-3 py-2">
              <p className="font-mono text-xs font-semibold text-brand-800">{l.code}</p>
              <p className="text-sm">{l.name}</p>
            </li>
          ))}
        </ol>
        {p.note && <p className="mt-3 text-xs text-muted">{p.note}</p>}
      </div>
    </div>
  );
}
