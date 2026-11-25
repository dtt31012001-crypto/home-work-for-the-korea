"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

/** Tải dữ liệu GET kèm trạng thái loading/error và hàm tải lại. path = null → không tải. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>("GET", path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "Đã có lỗi xảy ra.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}
