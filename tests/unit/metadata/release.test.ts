import { describe, expect, it } from "vitest";
import { getReleaseMetadata } from "@/lib/metadata/release";
import packageJson from "../../../package.json";
import releaseDateJson from "@/lib/metadata/release-date.json";

describe("getReleaseMetadata", () => {
  it("returns the version from package.json", () => {
    const { version } = getReleaseMetadata();
    expect(version).toBe(packageJson.version);
  });

  it("returns the releaseDate from release-date.json", () => {
    const { releaseDate } = getReleaseMetadata();
    expect(releaseDate).toBe(releaseDateJson.releaseDate);
  });
});
