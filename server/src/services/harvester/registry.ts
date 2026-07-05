import { InternalAdapter } from './adapters/internal';
import { ShadcnAdapter } from './adapters/shadcn';

export interface Component {
  name: string;
  source: 'internal' | 'shadcn';
  category: string;
  version: string;
  license: string;
  dependencies: string[];
  tfrsClasses: string[];
  description?: string;
}

export interface RegistryAdapter {
  search(query: string): Promise<Component[]>;
  getAll(): Promise<Component[]>;
}

export function getAdapter(type: 'internal' | 'shadcn'): RegistryAdapter {
  if (type === 'internal') {
    return new InternalAdapter();
  } else if (type === 'shadcn') {
    return new ShadcnAdapter();
  }
  throw new Error(`Unknown adapter type: ${type}`);
}
