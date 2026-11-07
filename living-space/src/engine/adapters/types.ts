/**
 * Event-adapter architecture.
 *
 * Every connected source (Gmail, Calendar, Weather, Shortcuts alerts, task reminders, demo…)
 * is a SourceAdapter. It owns its polling/subscription, writes its own slice of the world
 * store and reports discrete happenings through `pushActivity`, which routes them to the
 * computer and/or phone. Adding a new service = adding one adapter file and registering it.
 */
export interface SourceAdapter {
  id: string;
  label: string;
  /** Which room device shows this source's activity. */
  channels: ("computer" | "phone")[];
  /** Start the adapter. Return a cleanup function. */
  start(): () => void;
  /** Optional manual refresh. */
  refresh?(): Promise<void>;
}
