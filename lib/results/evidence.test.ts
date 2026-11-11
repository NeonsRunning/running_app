import { describe, expect, it } from "vitest";
import {
  formatFinishTime,
  parseDistanceRun,
  parseFinishTime,
  resultPace,
} from "./evidence";

describe("parseFinishTime", () => {
  it.each([
    ["25:41", 1541],
    ["0:25:41", 1541],
    ["00:25:41", 1541],
    ["1:02:33", 3753],
    ["01:02:33", 3753],
    [" 1:02:33 ", 3753],
    ["1 : 02 : 33", 3753],
    ["120:00:00", 432000],
  ])("reads colon form %j", (input, seconds) => {
    expect(parseFinishTime(input)).toBe(seconds);
  });

  it.each([
    ["1.02.33", 3753],
    ["1;02;33", 3753],
    ["1 02 33", 3753],
    ["25.41", 1541],
    ["01：02：33", 3753],
    ["１:０２:３３", 3753],
  ])("reads other separators %j", (input, seconds) => {
    expect(parseFinishTime(input)).toBe(seconds);
  });

  it.each([
    ["541", 341],
    ["2541", 1541],
    ["12541", 5141],
    ["012541", 5141],
    ["010233", 3753],
    ["1000000", 360000],
  ])("reads digits only %j from the right", (input, seconds) => {
    expect(parseFinishTime(input)).toBe(seconds);
  });

  it.each([
    ["25:41.3", 1542],
    ["25:41,9", 1542],
    ["1:02:33.0", 3753],
    ["1:02:33.00", 3753],
  ])("rounds a fraction %j up to the next second", (input, seconds) => {
    expect(parseFinishTime(input)).toBe(seconds);
  });

  it.each([
    "",
    "25",
    "abc",
    "0:00",
    "00:00:00",
    "0000",
    "1:60:00",
    "25:60",
    "2560",
    "1:2:3",
    "1.02.33.4",
    "168:00:00",
    "1:02:33:44",
  ])("rejects %j", (input) => {
    expect(parseFinishTime(input)).toBeNull();
  });

  it("round-trips through formatFinishTime", () => {
    for (const seconds of [1, 59, 60, 1541, 3600, 3753, 86399]) {
      expect(parseFinishTime(formatFinishTime(seconds))).toBe(seconds);
    }
  });
});

describe("parseDistanceRun", () => {
  it.each([
    ["10.01", 10.01],
    ["10,01", 10.01],
    [" 10.01 km ", 10.01],
    ["10.01KM", 10.01],
    ["5", 5],
    ["21.0975", 21.1],
    ["１０．０１", 10.01],
  ])("reads %j as %d", (input, km) => {
    expect(parseDistanceRun(input)).toBe(km);
  });

  it.each(["", "0", "0.001", "501", "-5", "ten", "10.01.2"])(
    "rejects %j",
    (input) => {
      expect(parseDistanceRun(input)).toBeNull();
    },
  );
});

describe("resultPace", () => {
  it("is over the distance run when the runner gave one", () => {
    // A 5K sent as the 10.01 km run it was part of.
    expect(resultPace(3573, 5, 10.01)).toBe("5:57 / km");
  });

  it("is over the category's distance otherwise", () => {
    expect(resultPace(3573, 5, null)).toBe("11:55 / km");
  });
});
