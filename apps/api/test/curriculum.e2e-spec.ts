import type { INestApplication } from "@nestjs/common";
import { createApp, loggedIn, prisma, resetDb, seedOrg } from "./helpers";

let app: INestApplication;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

async function setup() {
  const orgA = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Khác");
  const sa = (await loggedIn(app, { phone: "+84900000001", roles: [{ role: "SUPER_ADMIN" }] })).client;
  const ca = (await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: orgA.id }] })).client;
  const caB = (await loggedIn(app, { phone: "+84900000003", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] })).client;
  const tree = await sa.get("/api/admin/curricula");
  const level = (code: string) => tree.body.series.flatMap((s: { levels: { code: string; id: string }[] }) => s.levels).find((l: { code: string }) => l.code === code);
  return { orgA, orgB, sa, ca, caB, level };
}

describe("Mã chương trình (D-B03)", () => {
  it("có sẵn đủ hai hệ với mã đã duyệt, là dữ liệu (không có phiên bản/bài nào được tự tạo)", async () => {
    const { sa } = await setup();
    const tree = (await sa.get("/api/admin/curricula")).body;
    expect(tree.series.map((s: { code: string }) => s.code)).toEqual(["TH", "KIIP"]);
    expect(tree.series[0].levels.map((l: { code: string }) => l.code)).toEqual(["TH01", "TH02", "TH03", "TH04", "TH05", "TH06"]);
    expect(tree.series[1].levels.map((l: { code: string }) => l.code)).toEqual(["KIIP00", "KIIP01", "KIIP02", "KIIP03", "KIIP04", "KIIP05-B", "KIIP05-A"]);
    expect(tree.series[1].levels.filter((l: { structure: string }) => l.structure === "SOCIETY").map((l: { code: string }) => l.code)).toEqual(["KIIP05-B", "KIIP05-A"]);
    expect(tree.series.flatMap((s: { levels: { editions: unknown[] }[] }) => s.levels.flatMap((l) => l.editions))).toEqual([]);
  });

  it("Super Admin thêm cấp độ mới (mở rộng, vd. TOPIK); mã trùng bị từ chối; người khác không truy cập được", async () => {
    const { sa, ca, level } = await setup();
    const series = (await sa.get("/api/admin/curricula")).body.series[0];
    expect((await sa.post("/api/admin/curricula/levels", { seriesId: series.id, code: "th01", nameVi: "Trùng" })).body.error.code).toBe("LEVEL_CODE_TAKEN");
    expect((await sa.post("/api/admin/curricula/levels", { seriesId: series.id, code: "TH-GT", nameVi: "Giao tiếp" })).status).toBe(201);
    expect((await ca.get("/api/admin/curricula")).status).toBe(404);
    expect((await ca.post("/api/admin/curricula/editions", { levelId: level("TH01").id, name: "X" })).status).toBe(404);
  });
});

describe("Phiên bản giáo trình và nhập dần từng bài", () => {
  it("tạo phiên bản kèm nguồn & quyền sử dụng; nhập bài lẻ và nhiều bài; chưa có bài thì không đưa vào sử dụng", async () => {
    const { sa, level } = await setup();
    const ed = await sa.post("/api/admin/curricula/editions", {
      levelId: level("TH01").id,
      name: "Bản thử nghiệm",
      publishYear: 2024,
      rightsHolder: "Chủ sở hữu (chờ xác nhận)",
      licenseStatus: "UNCONFIRMED",
      allowedChannels: ["CLASS_INTERNAL"],
    });
    expect(ed.status).toBe(201);
    const id = ed.body.id;
    const activate = () => sa.agent.patch(`/api/admin/curricula/editions/${id}`).set("x-forwarded-for", sa.ip);
    const csrf = (await sa.get("/api/auth/csrf")).body.csrfToken;
    expect((await activate().set("x-csrf-token", csrf).send({ status: "ACTIVE" })).body.error.code).toBe("EDITION_HAS_NO_LESSONS");

    expect((await sa.post(`/api/admin/curricula/editions/${id}/lessons`, { number: 1, titleVi: "Bài thử 1" })).status).toBe(201);
    expect((await sa.post(`/api/admin/curricula/editions/${id}/lessons`, { number: 1, titleVi: "Trùng" })).body.error.code).toBe("LESSON_NUMBER_TAKEN");

    const bad = await sa.post(`/api/admin/curricula/editions/${id}/lessons/bulk`, { text: "2 | Bài thử 2\n1 | Trùng số\nabc | Sai" });
    expect(bad.body.error.code).toBe("IMPORT_INVALID");
    expect(bad.body.error.details).toEqual([
      { line: 2, message: "Bài số 1 đã có" },
      { line: 3, message: "Số bài không hợp lệ" },
    ]);
    expect(await prisma.lesson.count({ where: { editionId: id } })).toBe(1); // tất cả hoặc không

    const ok = await sa.post(`/api/admin/curricula/editions/${id}/lessons/bulk`, { text: "2 | Bài thử 2\n3\tBài thử 3\t제3과" });
    expect(ok.body).toEqual({ created: 2 });
    expect((await activate().set("x-csrf-token", csrf).send({ status: "ACTIVE" })).status).toBe(204);

    const detail = (await sa.get(`/api/admin/curricula/editions/${id}`)).body;
    expect(detail).toMatchObject({ status: "ACTIVE", licenseStatus: "UNCONFIRMED", allowedChannels: ["CLASS_INTERNAL"], level: { code: "TH01" } });
    expect(detail.lessons.map((l: { number: number }) => l.number)).toEqual([1, 2, 3]);
    expect(detail.lessons[2].titleKo).toBe("제3과");
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "curriculum." } } })).toBeGreaterThanOrEqual(4);
  });
});

describe("Cấp giáo trình cho trung tâm", () => {
  it("Super Admin cấp/thu hồi; Center Admin chỉ xem giáo trình của trung tâm mình", async () => {
    const { orgA, orgB, sa, ca, caB, level } = await setup();
    const ed = (await sa.post("/api/admin/curricula/editions", { levelId: level("KIIP01").id, name: "Bản A" })).body.id;
    const g = await sa.post(`/api/organizations/${orgA.id}/curricula`, { editionId: ed });
    expect(g.status).toBe(201);
    expect((await sa.post(`/api/organizations/${orgA.id}/curricula`, { editionId: ed })).body.error.code).toBe("ALREADY_GRANTED");

    const list = await ca.get(`/api/organizations/${orgA.id}/curricula`);
    expect(list.body).toEqual([expect.objectContaining({ level: { code: "KIIP01", nameVi: "Cấp 1 – Sơ cấp 1" }, edition: expect.objectContaining({ id: ed, name: "Bản A" }) })]);
    expect((await ca.post(`/api/organizations/${orgA.id}/curricula`, { editionId: ed })).status).toBe(404);
    expect((await caB.get(`/api/organizations/${orgA.id}/curricula`)).status).toBe(404);
    expect((await caB.get(`/api/organizations/${orgB.id}/curricula`)).body).toEqual([]);

    expect((await sa.post(`/api/organizations/${orgA.id}/curricula/${g.body.id}/revoke`)).status).toBe(204);
    expect((await ca.get(`/api/organizations/${orgA.id}/curricula`)).body).toEqual([]);
    expect((await sa.post(`/api/organizations/${orgA.id}/curricula`, { editionId: ed })).status).toBe(201); // cấp lại được
  });
});
