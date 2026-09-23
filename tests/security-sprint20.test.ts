import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { parseAnalyticsFilters, SecurityInputError } from "@/lib/security/request-guards";

describe("Sprint 20 security controls", () => {
  it("acepta filtros de analítica seguros", () => {
    const params = new URLSearchParams({
      period: "40d",
      unitId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parseAnalyticsFilters(params)).toEqual({
      period: "40d",
      unitId: "11111111-1111-4111-8111-111111111111",
      topicId: null,
    });
  });

  it("rechaza ids manipulados en analítica", () => {
    const params = new URLSearchParams({ period: "40d", unitId: "../../admin" });
    expect(() => parseAnalyticsFilters(params)).toThrow(SecurityInputError);
  });

  it("rechaza periodos desconocidos", () => {
    const params = new URLSearchParams({ period: "3650d" });
    expect(() => parseAnalyticsFilters(params)).toThrow(SecurityInputError);
  });

  it("configura cabeceras de seguridad y no-cache para APIs", async () => {
    const headers = await nextConfig.headers?.();
    const global = headers?.find((entry) => entry.source === "/(.*)");
    const api = headers?.find((entry) => entry.source === "/api/:path*");
    expect(global?.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Content-Security-Policy" }),
        expect.objectContaining({ key: "Strict-Transport-Security" }),
        expect.objectContaining({ key: "X-Content-Type-Options", value: "nosniff" }),
      ]),
    );
    expect(api?.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Cache-Control", value: "no-store, max-age=0" }),
      ]),
    );
  });
});
