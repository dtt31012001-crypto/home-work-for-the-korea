-- Nền tảng Row-Level Security cho dữ liệu thuộc trung tâm.
-- Mỗi transaction của ứng dụng đặt:
--   app.org_ids   = danh sách UUID trung tâm người dùng được phép (phân tách bởi dấu phẩy)
--   app.bypass_rls = 'on' chỉ cho Super Admin / tác vụ hệ thống
-- Không đặt gì → không thấy hàng nào (mặc định từ chối).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION app_org_visible(org uuid) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on'
      OR org = ANY (string_to_array(nullif(current_setting('app.org_ids', true), ''), ',')::uuid[])
$$;
