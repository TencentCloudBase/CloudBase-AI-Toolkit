import { describe, expect, it } from "vitest";
import { diffTriggerLists } from "./trigger-diff.js";

describe("trigger delete diff", () => {
  it("reports only the requested trigger when nothing else disappeared", () => {
    expect(
      diffTriggerLists(
        ["hourlyPriceSync", "tempDiag"],
        ["hourlyPriceSync"],
        "tempDiag",
      ),
    ).toEqual({ removed: ["tempDiag"], unexpected: [] });
  });

  it("reports every trigger lost when the delete clears the whole list", () => {
    expect(
      diffTriggerLists(
        ["hourlyPriceSync", "tempDiag"],
        [],
        "tempDiag",
      ),
    ).toEqual({
      removed: ["hourlyPriceSync", "tempDiag"],
      unexpected: ["hourlyPriceSync"],
    });
  });

  it("reports nothing when the requested trigger was not present", () => {
    expect(
      diffTriggerLists(["hourlyPriceSync"], ["hourlyPriceSync"], "missing"),
    ).toEqual({ removed: [], unexpected: [] });
  });

  it("keeps unchanged names out of the removed list", () => {
    expect(
      diffTriggerLists(["a", "b"], ["a", "b"], "a"),
    ).toEqual({ removed: [], unexpected: [] });
  });
});
