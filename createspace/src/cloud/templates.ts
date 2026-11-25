import { Briefcase, Camera, Clapperboard, FolderPlus, Megaphone, PenTool, Sparkles, type LucideIcon } from 'lucide-react';

/** A folder in a template; nested with `children`. */
export interface TemplateFolder {
  name: string;
  children?: TemplateFolder[];
}

export interface StarterFile {
  /** Folder path inside the project, e.g. "Brief". */
  folder: string;
  name: string;
  content: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  folders: TemplateFolder[];
  /** Small text files created with the project (e.g. a brief to fill in). */
  starterFiles?: StarterFile[];
}

const BRIEF = `# Project brief

**Client / for:**
**Deadline:**

## Goal
What does this project need to achieve?

## Audience
Who is it for?

## Deliverables
- 

## References & notes
`;

const SHOT_LIST = `Scene,Shot,Description,Camera,Duration,Notes
1,1,,,,
`;

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank project',
    description: 'Start empty and make your own folders.',
    icon: FolderPlus,
    accent: '#8A8794',
    folders: [],
  },
  {
    id: 'animation',
    name: 'Animation',
    description: 'From script to final render.',
    icon: Sparkles,
    accent: '#8257E6',
    folders: [
      { name: '01 Script' },
      { name: '02 Storyboard' },
      { name: '03 Character Design', children: [{ name: 'Turnarounds' }, { name: 'Expressions' }] },
      { name: '04 Backgrounds' },
      { name: '05 Animation' },
      { name: '06 Audio' },
      { name: '07 Renders' },
      { name: '08 Final' },
    ],
  },
  {
    id: 'film',
    name: 'Film & Video',
    description: 'Footage, sound, graphics and exports.',
    icon: Clapperboard,
    accent: '#3778E0',
    folders: [
      { name: 'Pre-production', children: [{ name: 'Script' }, { name: 'Shot List' }] },
      { name: 'Footage', children: [{ name: 'A-Roll' }, { name: 'B-Roll' }] },
      { name: 'Audio', children: [{ name: 'Dialogue' }, { name: 'Music' }, { name: 'SFX' }] },
      { name: 'Graphics' },
      { name: 'Exports' },
    ],
    starterFiles: [{ folder: 'Pre-production/Shot List', name: 'Shot list.csv', content: SHOT_LIST }],
  },
  {
    id: 'brand',
    name: 'Brand Identity',
    description: 'Logo, colors, type and deliverables.',
    icon: PenTool,
    accent: '#E4572E',
    folders: [
      { name: 'Brief' },
      { name: 'Research & Moodboard' },
      { name: 'Logo', children: [{ name: 'Sketches' }, { name: 'Final' }] },
      { name: 'Color & Type' },
      { name: 'Mockups' },
      { name: 'Deliverables' },
    ],
    starterFiles: [{ folder: 'Brief', name: 'Project brief.md', content: BRIEF }],
  },
  {
    id: 'photo',
    name: 'Photo Shoot',
    description: 'Selects, edits and final exports.',
    icon: Camera,
    accent: '#17A398',
    folders: [{ name: 'Mood & References' }, { name: 'Selects' }, { name: 'Edited' }, { name: 'Exports' }, { name: 'Releases & Contracts' }],
  },
  {
    id: 'social',
    name: 'Social Content',
    description: 'Ideas, scripts, clips and thumbnails.',
    icon: Megaphone,
    accent: '#DD4685',
    folders: [{ name: 'Ideas' }, { name: 'Scripts' }, { name: 'Raw Clips' }, { name: 'Thumbnails' }, { name: 'Captions' }, { name: 'Published' }],
  },
  {
    id: 'client',
    name: 'Client Project',
    description: 'Brief, feedback, finals and paperwork.',
    icon: Briefcase,
    accent: '#1F9479',
    folders: [
      { name: 'Brief' },
      { name: 'References' },
      { name: 'Work in Progress' },
      { name: 'Feedback' },
      { name: 'Final Files' },
      { name: 'Contracts & Invoices' },
    ],
    starterFiles: [{ folder: 'Brief', name: 'Project brief.md', content: BRIEF }],
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
