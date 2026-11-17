import { describe, expect, it } from "vitest";
import {
  diffTriggerCreation,
  diffTriggerLists,
  planTriggerCreation,
} from "./trigger-diff.js";

describe("trigger delete diff", () => {
  it("reports only the requested trigger when nothing else disappeared", () => {
    expect(
      diffTriggerLists(
        ["hourlySync", "tempDiag"],
        ["hourlySync"],
        "tempDiag",
      ),
    ).toEqual({ removed: ["tempDiag"], unexpected: [] });
  });

  it("reports every trigger lost when the delete clears the whole list", () => {
    expect(
      diffTriggerLists(
        ["hourlySync", "tempDiag"],
        [],
        "tempDiag",
      ),
    ).toEqual({
      removed: ["hourlySync", "tempDiag"],
      unexpected: ["hourlySync"],
    });
  });

  it("reports nothing when the requested trigger was not present", () => {
    expect(
      diffTriggerLists(["hourlySync"], ["hourlySync"], "missing"),
    ).toEqual({ removed: [], unexpected: [] });
  });

  it("keeps unchanged names out of the removed list", () => {
    expect(
      diffTriggerLists(["a", "b"], ["a", "b"], "a"),
    ).toEqual({ removed: [], unexpected: [] });
  });
});

describe("trigger creation planning", () => {
  it("blocks a partial create when other timer triggers exist", () => {
    expect(
      planTriggerCreation(["hourlySync", "tempDiag"], ["tempDiag"], false),
    ).toEqual({ willRemove: ["hourlySync"], action: "blocked" });
  });

  it("allows the same call when replaceAll is explicit", () => {
    expect(
      planTriggerCreation(["hourlySync", "tempDiag"], ["tempDiag"], true),
    ).toEqual({ willRemove: ["hourlySync"], action: "replace" });
  });

  it("does not block a full submission or an empty function", () => {
    expect(
      planTriggerCreation(["hourlySync"], ["hourlySync", "tempDiag"], false),
    ).toEqual({ willRemove: [], action: "create" });
    expect(planTriggerCreation([], ["tempDiag"], false)).toEqual({
      willRemove: [],
      action: "create",
    });
  });

  it("reports names added and removed around a create", () => {
    expect(
      diffTriggerCreation(["a", "b"], ["b", "c"]),
    ).toEqual({ added: ["c"], removed: ["a"] });
  });
});
