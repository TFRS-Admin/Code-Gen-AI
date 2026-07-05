import { Component, RegistryAdapter } from '../registry';

// ─────────────────────────────────────────────
// Shadcn/Radix component catalog
//
// Mirrors the subset of components.json-generated primitives already
// vendored under src/components/ui, so names/dependencies/license reflect
// real registry entries rather than invented data. tfrsClasses is empty for
// every entry — these ship in generic "new-york" style and only gain TFRS
// classes once the harvester's adaptation step (ADR-0003, TICKET-030) runs.
// ─────────────────────────────────────────────
const CATALOG: Component[] = [
  {
    name: 'button',
    source: 'shadcn',
    category: 'form',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Button primitive with variant/size styles via class-variance-authority.',
  },
  {
    name: 'card',
    source: 'shadcn',
    category: 'data-display',
    version: 'latest',
    license: 'MIT',
    dependencies: ['clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Bordered content container with header/content/footer slots.',
  },
  {
    name: 'dialog',
    source: 'shadcn',
    category: 'overlay',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-dialog', 'lucide-react', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Accessible modal dialog built on Radix Dialog.',
  },
  {
    name: 'alert-dialog',
    source: 'shadcn',
    category: 'overlay',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-alert-dialog', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Interruptive confirmation dialog built on Radix Alert Dialog.',
  },
  {
    name: 'dropdown-menu',
    source: 'shadcn',
    category: 'navigation',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-dropdown-menu', 'lucide-react', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Accessible dropdown menu built on Radix Dropdown Menu.',
  },
  {
    name: 'tabs',
    source: 'shadcn',
    category: 'navigation',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-tabs', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Tabbed panel navigation built on Radix Tabs.',
  },
  {
    name: 'tooltip',
    source: 'shadcn',
    category: 'overlay',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-tooltip', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Hover/focus tooltip built on Radix Tooltip.',
  },
  {
    name: 'select',
    source: 'shadcn',
    category: 'form',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-select', 'lucide-react', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Accessible select control built on Radix Select.',
  },
  {
    name: 'sheet',
    source: 'shadcn',
    category: 'overlay',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-dialog', 'class-variance-authority', 'lucide-react', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Slide-in side panel built on Radix Dialog.',
  },
  {
    name: 'badge',
    source: 'shadcn',
    category: 'data-display',
    version: 'latest',
    license: 'MIT',
    dependencies: ['class-variance-authority', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Small status/label pill with variant styles.',
  },
  {
    name: 'input',
    source: 'shadcn',
    category: 'form',
    version: 'latest',
    license: 'MIT',
    dependencies: ['clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Styled text input primitive.',
  },
  {
    name: 'separator',
    source: 'shadcn',
    category: 'layout',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-separator', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Horizontal/vertical divider built on Radix Separator.',
  },
  {
    name: 'accordion',
    source: 'shadcn',
    category: 'data-display',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-accordion', 'lucide-react', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'Collapsible content sections built on Radix Accordion.',
  },
  {
    name: 'avatar',
    source: 'shadcn',
    category: 'data-display',
    version: 'latest',
    license: 'MIT',
    dependencies: ['@radix-ui/react-avatar', 'clsx', 'tailwind-merge'],
    tfrsClasses: [],
    description: 'User/entity avatar with image fallback built on Radix Avatar.',
  },
  {
    name: 'sonner',
    source: 'shadcn',
    category: 'feedback',
    version: 'latest',
    license: 'MIT',
    dependencies: ['sonner'],
    tfrsClasses: [],
    description: 'Toast notification stack.',
  },
];

export class ShadcnAdapter implements RegistryAdapter {
  async search(query: string): Promise<Component[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAll();
    return CATALOG.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
    );
  }

  async getAll(): Promise<Component[]> {
    return CATALOG.map((c) => ({ ...c, dependencies: [...c.dependencies], tfrsClasses: [...c.tfrsClasses] }));
  }
}
