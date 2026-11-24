import type { ToolStatus } from './types';

interface StatusMeta {
  label: string;
  /** Whether people can actually use the tool. */
  usable: boolean;
  explanation: string;
}

export const STATUS: Record<ToolStatus, StatusMeta> = {
  'coming-soon': {
    label: 'Coming soon',
    usable: false,
    explanation: 'This tool is planned but hasn’t been built yet.',
  },
  'in-development': {
    label: 'In development',
    usable: false,
    explanation: 'This tool is being built and isn’t ready to use yet.',
  },
  beta: { label: 'Beta', usable: true, explanation: 'This tool works, but may still change.' },
  available: { label: 'Available', usable: true, explanation: '' },
};
