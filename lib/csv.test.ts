import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it.each([
    ['=HYPERLINK("http://evil.example","Click")', `"'=HYPERLINK(""http://evil.example"",""Click"")"`],
    ["+cmd|' /C calc'!A0", `"'+cmd|' /C calc'!A0"`],
    ["-2+3+cmd|' /C calc'!A0", `"'-2+3+cmd|' /C calc'!A0"`],
    ["@SUM(1,2)", `"'@SUM(1,2)"`],
    ["\t=1+1", `"'\t=1+1"`],
  ])("neutralises the formula %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    ["Ana Figueroa", `"Ana Figueroa"`],
    ["+1 (787) 555-0103", `"+1 (787) 555-0103"`],
    ["-5", `"-5"`],
    [1048, `"1048"`],
    [null, `""`],
    ['Club "Los Rápidos"', `"Club ""Los Rápidos"""`],
  ])("leaves ordinary values alone: %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with newlines", () => {
    expect(toCsv([["a", 1], ["=b", null]])).toBe(`"a","1"\n"'=b",""`);
  });
});
