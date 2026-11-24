import { Briefcase, ListChecks, Megaphone, Palette } from 'lucide-react';
import type { CategoryDefinition, CategoryId } from './types';

export const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'creative',
    name: 'Creative',
    navLabel: 'Creative Tools',
    description: 'Color, composition, characters and practice for visual artists.',
    icon: Palette,
  },
  {
    id: 'content',
    name: 'Content',
    navLabel: 'Content Tools',
    description: 'Plan, record and prepare content for publishing.',
    icon: Megaphone,
  },
  {
    id: 'productivity',
    name: 'Productivity',
    navLabel: 'Productivity Tools',
    description: 'Stay focused, capture ideas and hit your deadlines.',
    icon: ListChecks,
  },
  {
    id: 'business',
    name: 'Business',
    navLabel: 'Business Tools',
    description: 'Price your work and get paid.',
    icon: Briefcase,
  },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export const getCategory = (id: CategoryId): CategoryDefinition => byId.get(id)!;

export const isCategoryId = (value: string | null | undefined): value is CategoryId =>
  !!value && byId.has(value as CategoryId);

export const categoryRoute = (id: CategoryId) => `/category/${id}`;
