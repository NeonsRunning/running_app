import { describe, expect, it } from "vitest";
import { paymentCode } from "./config";

describe("paymentCode", () => {
  const id = "3f9a1c2d-77b0-4e1a-9c3d-0123456789ab";

  it("is NR- and the first eight hex characters of the id, upper case", () => {
    expect(paymentCode(id)).toBe("NR-3F9A1C2D");
  });

  it("still starts with the six-character code older messages carry", () => {
    expect(paymentCode(id).startsWith("NR-3F9A1C")).toBe(true);
  });

  it("does not run across the id's hyphens", () => {
    expect(paymentCode("abcdef12-3456-4789-8abc-def012345678")).toBe("NR-ABCDEF12");
  });
});
