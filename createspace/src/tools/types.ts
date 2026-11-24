import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

export type CategoryId = 'creative' | 'content' | 'productivity' | 'business';

/**
 * - coming-soon:    planned, no work started
 * - in-development: actively being built, not usable yet
 * - beta:           usable, but may change
 * - available:      finished and approved
 */
export type ToolStatus = 'coming-soon' | 'in-development' | 'beta' | 'available';

export interface ToolDefinition {
  /** Unique, URL-safe id. Also used as the favorites key, so never rename a published id. */
  id: string;
  name: string;
  /** One short sentence describing what the tool does. */
  description: string;
  category: CategoryId;
  icon: LucideIcon;
  /** Hex color that gives the tool its own personality on cards and its page. */
  accent: string;
  /** Extra words people might search for. */
  keywords: string[];
  /** Page address, e.g. "/tools/color-studio". */
  route: string;
  status: ToolStatus;
  /** What the tool is planned to do. Shown on its page while it isn't built yet. */
  plannedFeatures: string[];
  /** The concept may still change or be dropped. */
  tentative?: boolean;
  /**
   * The tool's actual interface, loaded only when someone opens the tool (keeps the site fast).
   * Leave undefined until the tool is built. Example:
   *   workspace: lazy(() => import('./color-studio/ColorStudio'))
   */
  workspace?: LazyExoticComponent<ComponentType>;
}

export interface CategoryDefinition {
  id: CategoryId;
  name: string;
  /** Nav label, e.g. "Creative Tools". */
  navLabel: string;
  description: string;
  icon: LucideIcon;
}
