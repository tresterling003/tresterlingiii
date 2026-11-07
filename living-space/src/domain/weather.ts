import type { WeatherKind } from "./types";

/** WMO weather interpretation codes → scene weather state + human description. */
export function describeWmo(code: number): { kind: Exclude<WeatherKind, "clear-night">; description: string } {
  if (code === 0) return { kind: "sunny", description: "Clear sky" };
  if (code === 1) return { kind: "partly-cloudy", description: "Mostly clear" };
  if (code === 2) return { kind: "partly-cloudy", description: "Partly cloudy" };
  if (code === 3) return { kind: "cloudy", description: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", description: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "rain", description: code >= 56 ? "Freezing drizzle" : "Drizzle" };
  if (code >= 61 && code <= 67) return { kind: "rain", description: code >= 66 ? "Freezing rain" : code === 65 ? "Heavy rain" : "Rain" };
  if (code >= 71 && code <= 77) return { kind: "snow", description: code === 77 ? "Snow grains" : code === 75 ? "Heavy snow" : "Snow" };
  if (code >= 80 && code <= 82) return { kind: "rain", description: code === 82 ? "Violent showers" : "Rain showers" };
  if (code === 85 || code === 86) return { kind: "snow", description: "Snow showers" };
  if (code >= 95) return { kind: "thunderstorm", description: code > 95 ? "Thunderstorm with hail" : "Thunderstorm" };
  return { kind: "cloudy", description: "Unsettled" };
}

/** Night turns clear/mostly-clear skies into the "clear night" scene. Other weather keeps its kind. */
export function sceneWeather(code: number, isDay: boolean): WeatherKind {
  const { kind } = describeWmo(code);
  if (!isDay && (kind === "sunny" || kind === "partly-cloudy")) return "clear-night";
  return kind;
}

/** How much a weather state dims the daylight entering the room (0 = none). */
export function weatherDimming(kind: WeatherKind): number {
  switch (kind) {
    case "sunny":
    case "clear-night":
      return 0;
    case "partly-cloudy":
      return 0.08;
    case "cloudy":
    case "fog":
      return 0.2;
    case "snow":
      return 0.18;
    case "rain":
      return 0.3;
    case "thunderstorm":
      return 0.42;
  }
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  sunny: "Sunny",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  rain: "Rainy",
  thunderstorm: "Thunderstorm",
  snow: "Snowy",
  "clear-night": "Clear night",
};
