import { Confetti } from "./Confetti";
import { Snowfall } from "./Snowfall";
import { Fireworks } from "./Fireworks";
import { PawPrints } from "./PawPrints";
import { TeamSpirit } from "./TeamSpirit";

export function AnimationBackground({ pack }: { pack: string }) {
  switch (pack) {
    case "confetti":
      return <Confetti />;
    case "snow":
      return <Snowfall />;
    case "fireworks":
      return <Fireworks />;
    case "paw-prints":
      return <PawPrints />;
    case "team":
      return <TeamSpirit />;
    default:
      return null;
  }
}
