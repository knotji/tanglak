import packageJson from "../../../package.json";
import releaseDateJson from "./release-date.json";

export interface ReleaseMetadata {
  version: string;
  releaseDate: string;
}

export function getReleaseMetadata(): ReleaseMetadata {
  return {
    version: packageJson.version,
    releaseDate: releaseDateJson.releaseDate,
  };
}
