"use client";

import { CHANNEL_LABEL, LICENSE_STATUS_LABEL, type Channel, type EditionDetail, type LicenseStatus } from "@th/contracts";
import { useState, type FormEvent } from "react";
import { ErrorBox, Field, PrimaryButton, SelectField, TextArea } from "../ui";

export interface EditionFormValue {
  name: string;
  publishYear: string;
  publisher: string;
  rightsHolder: string;
  licenseStatus: LicenseStatus;
  allowedChannels: Channel[];
  licenseValidUntil: string;
  licenseNote: string;
}

export const emptyEdition: EditionFormValue = {
  name: "",
  publishYear: "",
  publisher: "",
  rightsHolder: "",
  licenseStatus: "UNCONFIRMED",
  allowedChannels: [],
  licenseValidUntil: "",
  licenseNote: "",
};

export function editionToForm(e: EditionDetail): EditionFormValue {
  return {
    name: e.name,
    publishYear: e.publishYear?.toString() ?? "",
    publisher: e.publisher ?? "",
    rightsHolder: e.rightsHolder ?? "",
    licenseStatus: e.licenseStatus,
    allowedChannels: e.allowedChannels,
    licenseValidUntil: e.licenseValidUntil ?? "",
    licenseNote: e.licenseNote ?? "",
  };
}

export function formToBody(v: EditionFormValue) {
  return {
    name: v.name,
    publishYear: v.publishYear ? Number(v.publishYear) : null,
    publisher: v.publisher,
    rightsHolder: v.rightsHolder,
    licenseStatus: v.licenseStatus,
    allowedChannels: v.allowedChannels,
    licenseValidUntil: v.licenseValidUntil || null,
    licenseNote: v.licenseNote,
  };
}

/** Form phiên bản giáo trình: tên + nguồn + tình trạng quyền sử dụng. */
export function EditionForm({ initial, submitLabel, onSubmit }: { initial: EditionFormValue; submitLabel: string; onSubmit: (v: EditionFormValue) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setError("Vui lòng nhập tên phiên bản.");
    setLoading(true);
    setError(undefined);
    setSaved(false);
    try {
      await onSubmit(v);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  const toggle = (c: Channel) =>
    setV({ ...v, allowedChannels: v.allowedChannels.includes(c) ? v.allowedChannels.filter((x) => x !== c) : [...v.allowedChannels, c] });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <ErrorBox message={error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên phiên bản" hint="vd. Bản 2024" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Field label="Năm xuất bản" inputMode="numeric" value={v.publishYear} onChange={(e) => setV({ ...v, publishYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        <Field label="Nhà xuất bản" value={v.publisher} onChange={(e) => setV({ ...v, publisher: e.target.value })} />
        <Field label="Chủ sở hữu bản quyền" value={v.rightsHolder} onChange={(e) => setV({ ...v, rightsHolder: e.target.value })} />
        <SelectField
          label="Tình trạng quyền sử dụng"
          value={v.licenseStatus}
          onChange={(e) => setV({ ...v, licenseStatus: e.target.value as LicenseStatus })}
          options={Object.entries(LICENSE_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Field label="Quyền có hiệu lực đến" type="date" value={v.licenseValidUntil} onChange={(e) => setV({ ...v, licenseValidUntil: e.target.value })} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Kênh được phép sử dụng</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={v.allowedChannels.includes(c)} onChange={() => toggle(c)} className="size-4 accent-brand-700" />
              {CHANNEL_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea label="Ghi chú về quyền sử dụng" value={v.licenseNote} onChange={(e) => setV({ ...v, licenseNote: e.target.value })} />
      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" loading={loading}>
          {submitLabel}
        </PrimaryButton>
        {saved && <span className="text-sm text-brand-700">Đã lưu.</span>}
      </div>
    </form>
  );
}
