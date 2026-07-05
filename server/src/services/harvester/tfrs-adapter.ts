// TFRS Adapter: maps generic Tailwind classes to TFRS Tactical Command Deck
// design tokens, per docs/07-design-system.md (palette/typography) and the
// "Styling replacements" table in docs/06-component-harvester.md. This is
// the adaptation step in the harvester pipeline (docs/06, ADR-0003) that
// runs after a component is sourced, so every adapted component — internal
// or harvested — ends up on the same token set.

export interface TokenMapping {
  [key: string]: string;
}

// Color token mappings (docs/07-design-system.md core palette)
const colorTokens: TokenMapping = {
  // Backgrounds — generic → TFRS surface tokens
  'bg-white': 'bg-tfrs-elevated',
  'bg-gray-50': 'bg-tfrs-bg',
  'bg-gray-100': 'bg-tfrs-surface',
  'bg-gray-200': 'bg-tfrs-surface-2',

  // Command accent — generic blue CTAs become the TFRS red accent
  'bg-blue-500': 'bg-tfrs-red',
  'bg-blue-600': 'bg-tfrs-red',
  'bg-blue-700': 'bg-tfrs-red-bright',
  'text-blue-500': 'text-tfrs-gold',
  'text-blue-600': 'text-tfrs-gold',
  'text-white': 'text-tfrs-ink',

  // Body/muted text — steel/ink tokens
  'text-gray-900': 'text-tfrs-ink',
  'text-gray-600': 'text-tfrs-steel',
  'text-gray-500': 'text-tfrs-steel',
  'text-gray-400': 'text-tfrs-steel',

  // Borders
  'border-gray-200': 'border-tfrs-border',
  'border-gray-300': 'border-tfrs-border-strong',

  // Hover/active states
  'hover:bg-blue-600': 'hover:bg-tfrs-red-bright',
  'hover:bg-blue-700': 'hover:bg-tfrs-red-bright',
  'hover:bg-gray-100': 'hover:bg-tfrs-surface',
  'hover:bg-gray-200': 'hover:bg-tfrs-surface-2',
  'active:bg-blue-700': 'active:bg-tfrs-red-bright',

  // Status colors
  'text-green-500': 'text-tfrs-success',
  'text-green-600': 'text-tfrs-success',
  'bg-green-500': 'bg-tfrs-success',
  'text-yellow-500': 'text-tfrs-warning',
  'text-yellow-600': 'text-tfrs-warning',
  'bg-yellow-500': 'bg-tfrs-warning',
};

// Typography token mappings (docs/07-design-system.md Typography table)
const typographyTokens: TokenMapping = {
  // Sizes pass through unchanged — only weight/case need adaptation
  'text-sm': 'text-sm',
  'text-base': 'text-base',
  'text-lg': 'text-lg',
  'text-xl': 'text-xl',

  // Heading weights → tactical display/section heading pattern
  'font-bold': 'font-black uppercase tracking-wider',
  'font-extrabold': 'font-extrabold uppercase tracking-wide',
  'font-semibold': 'font-extrabold uppercase tracking-wide',
  'font-medium': 'font-medium',
};

// Spacing token mappings (TFRS grid: 4px base) — already TFRS-compatible
const spacingTokens: TokenMapping = {
  'p-2': 'p-2',
  'p-3': 'p-3',
  'p-4': 'p-4',
  'p-6': 'p-6',
  'gap-2': 'gap-2',
  'gap-3': 'gap-3',
  'gap-4': 'gap-4',
  'space-y-2': 'space-y-2',
  'space-y-4': 'space-y-4',
  'space-x-2': 'space-x-2',
  'space-x-4': 'space-x-4',
};

// Border/radius/shadow token mappings (docs/06 "Styling replacements" table:
// rounded-lg -> rounded-sm, shadow-xl -> tactical border/glow)
const borderTokens: TokenMapping = {
  'rounded-md': 'rounded-sm',
  'rounded-lg': 'rounded-sm',
  'rounded-xl': 'rounded-sm',
  border: 'border',
  'border-2': 'border-2',
  shadow: 'border border-tfrs-border',
  'shadow-sm': 'border border-tfrs-border',
  'shadow-md': 'border border-tfrs-border',
  'shadow-lg': 'border border-tfrs-border-strong',
  'shadow-xl': 'border border-tfrs-border-strong',
};

// Combine all token mappings
const allTokens: TokenMapping = {
  ...colorTokens,
  ...typographyTokens,
  ...spacingTokens,
  ...borderTokens,
};

/**
 * Adapt component code by replacing generic Tailwind classes with TFRS tokens.
 * Handles JSX className attributes and Tailwind class strings.
 */
export function adaptComponentCode(componentCode: string): string {
  let adapted = componentCode;

  // Replace className attributes: className="bg-blue-500 text-white" → className="bg-tfrs-red text-tfrs-ink"
  adapted = adapted.replace(/className=["']([^"']+)["']/g, (_match, classes) => {
    const adaptedClasses = classes
      .split(/\s+/)
      .filter(Boolean)
      .map((cls: string) => allTokens[cls.trim()] || cls.trim())
      .join(' ');
    return `className="${adaptedClasses}"`;
  });

  // Replace template literals: className={`${classes} bg-blue-500`}
  adapted = adapted.replace(/className=\{`([^`]+)`\}/g, (_match, template) => {
    let adaptedTemplate = template;
    Object.entries(allTokens).forEach(([generic, tfrs]) => {
      adaptedTemplate = adaptedTemplate.replace(new RegExp(`\\b${escapeRegExp(generic)}\\b`, 'g'), tfrs);
    });
    return `className={\`${adaptedTemplate}\`}`;
  });

  // Replace direct string literals: "bg-blue-500"
  Object.entries(allTokens).forEach(([generic, tfrs]) => {
    adapted = adapted.replace(new RegExp(`(["'])${escapeRegExp(generic)}\\1`, 'g'), `"${tfrs}"`);
  });

  return adapted;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract TFRS classes used in adapted component for documentation.
 */
export function extractTFRSClasses(adaptedCode: string): string[] {
  const tfrsClasses = new Set<string>();
  const tfrsTokenValues = Object.values(allTokens);

  tfrsTokenValues.forEach((token) => {
    token.split(' ').forEach((cls) => {
      if (cls.includes('tfrs') && adaptedCode.includes(cls)) {
        tfrsClasses.add(cls);
      }
    });
  });

  return Array.from(tfrsClasses).sort();
}

/**
 * Get all available TFRS tokens for documentation/UI.
 */
export function getAllTFRSTokens(): TokenMapping {
  return { ...allTokens };
}
