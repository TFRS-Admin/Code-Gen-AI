import { Component, RegistryAdapter } from '../registry';

// ─────────────────────────────────────────────
// TFRSupply-frontend internal component catalog
//
// TFRSupply-frontend lives in a separate repository this server does not
// have direct access to, so the internal source is a curated catalog rather
// than a live crawl. Each entry already carries the TFRS Tactical Command
// Deck class names (docs/07-design-system.md) since these components ship
// from the design system pre-adapted — unlike harvested Shadcn/Radix
// components, which still need TFRS adaptation (ADR-0003).
// ─────────────────────────────────────────────
const CATALOG: Component[] = [
  {
    name: 'TacticalCard',
    source: 'internal',
    category: 'data-display',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['class-variance-authority', 'clsx', 'tailwind-merge'],
    tfrsClasses: ['rounded-sm', 'border-tfrs-border', 'bg-tfrs-elevated', 'text-tfrs-ink'],
    description: 'Bordered panel card with a command-deck header slot.',
  },
  {
    name: 'CommandButton',
    source: 'internal',
    category: 'form',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['class-variance-authority', 'clsx', '@radix-ui/react-slot'],
    tfrsClasses: ['rounded-sm', 'bg-tfrs-red', 'hover:bg-tfrs-red-bright', 'font-black', 'uppercase', 'tracking-wider'],
    description: 'Primary CTA button styled with the TFRS command accent.',
  },
  {
    name: 'TelemetryBadge',
    source: 'internal',
    category: 'data-display',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['class-variance-authority', 'clsx'],
    tfrsClasses: ['rounded-sm', 'font-mono', 'text-xs', 'uppercase', 'tracking-widest', 'text-tfrs-gold'],
    description: 'Numeric/status badge for telemetry and metadata display.',
  },
  {
    name: 'MissionPanel',
    source: 'internal',
    category: 'layout',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['clsx'],
    tfrsClasses: ['border-tfrs-border', 'bg-tfrs-surface', 'rounded-sm'],
    description: 'Dense grid panel container for dashboard sections.',
  },
  {
    name: 'StatusIndicator',
    source: 'internal',
    category: 'feedback',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['class-variance-authority', 'clsx'],
    tfrsClasses: ['font-mono', 'uppercase', 'tracking-widest', 'text-tfrs-success', 'text-tfrs-warning'],
    description: 'Inline status pill for queued/building/ready/error states.',
  },
  {
    name: 'DataGrid',
    source: 'internal',
    category: 'data-display',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['@tanstack/react-query', 'clsx'],
    tfrsClasses: ['font-mono', 'tabular-nums', 'border-tfrs-border', 'divide-tfrs-border'],
    description: 'Dense tabular grid for telemetry/report data.',
  },
  {
    name: 'TacticalHero',
    source: 'internal',
    category: 'marketing-section',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['clsx'],
    tfrsClasses: ['bg-tfrs-bg', 'text-tfrs-ink', 'font-black', 'uppercase', 'tracking-wider'],
    description: 'Landing page hero with tactical grid background and CTA slot.',
  },
  {
    name: 'AlertBanner',
    source: 'internal',
    category: 'feedback',
    version: '1.0.0',
    license: 'proprietary',
    dependencies: ['@radix-ui/react-toast', 'clsx'],
    tfrsClasses: ['rounded-sm', 'border-tfrs-border-strong', 'bg-tfrs-surface-2', 'text-tfrs-warning'],
    description: 'Persistent banner for warnings and system alerts.',
  },
];

export class InternalAdapter implements RegistryAdapter {
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
