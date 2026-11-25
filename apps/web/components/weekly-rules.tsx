"use client";

import { WEEKDAY_OPTIONS, type WeeklyRuleInput } from "@th/contracts";
import { Plus, Trash2 } from "lucide-react";
import { SecondaryButton } from "./ui";

/** Nhập lịch cố định: mỗi dòng một buổi trong tuần (thứ, giờ bắt đầu, giờ kết thúc). */
export function WeeklyRulesEditor({ value, onChange }: { value: WeeklyRuleInput[]; onChange: (v: WeeklyRuleInput[]) => void }) {
  const set = (i: number, patch: Partial<WeeklyRuleInput>) => onChange(value.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">Lịch cố định trong tuần</legend>
      {value.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Thứ"
            value={r.weekday}
            onChange={(e) => set(i, { weekday: Number(e.target.value) })}
            className="h-11 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <input aria-label="Giờ bắt đầu" type="time" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} className="h-11 rounded-lg border border-line bg-surface px-2 text-sm" />
          <span className="text-muted">–</span>
          <input aria-label="Giờ kết thúc" type="time" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} className="h-11 rounded-lg border border-line bg-surface px-2 text-sm" />
          {value.length > 1 && (
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label="Xóa buổi này">
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ))}
      <SecondaryButton type="button" onClick={() => onChange([...value, { ...(value.at(-1) ?? { weekday: 1, startTime: "18:00", endTime: "19:30" }), weekday: ((value.at(-1)?.weekday ?? 0) % 7) + 1 }])} icon={<Plus className="size-4" aria-hidden />}>
        Thêm buổi trong tuần
      </SecondaryButton>
    </fieldset>
  );
}
