import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("smoke", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@poker/shared");
  });
});
