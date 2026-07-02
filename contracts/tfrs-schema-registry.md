# TFRS In-House Schema Registry

This is the canonical data dictionary for all TFRS applications. When Blair builds a new app, it MUST cross-reference this registry first. If a required data entity already exists here, Blair reuses or extends the existing schema rather than inventing a new one. This is the foundation of inter-app compatibility.

---

## Core Entities

### BaseEntity
All TFRS entities extend `BaseEntity`.
```ts
interface BaseEntity {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}
```

### Customer
A customer is always an individual (first + last name), never a company.
```ts
interface Customer extends BaseEntity {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  agencyId?: string;       // Links to a law enforcement or fire agency
  dealerId?: string;
  role?: 'end-user' | 'dealer' | 'admin';
}
```

### Product (Part)
Part names are always ALL CAPS. Products are categorized by vertical (Law, Fire, Work Truck).
```ts
interface Product extends BaseEntity {
  sku: string;             // Always ALL CAPS
  verticalIds: string[];   // 'law' | 'fire' | 'work-truck'
  categoryIds: string[];
  price?: Money;
  dimensions?: Dimensions;
  images?: ImageAsset[];
}
```

### Package & PackageItems
```ts
interface Package extends BaseEntity {
  verticalIds: string[];
  lines: PackageLine[];    // The items in the package
  requiredAccessories?: Accessory[];
  optionalAccessories?: Accessory[];
  metadata?: { packageType: 'reusable' | 'vehicle-specific' | 'quote-ready' }
}

interface PackageLine {
  id: string;
  product: Product;
  quantity: number;
  required: boolean;
}
```

### Quote
```ts
interface Quote extends BaseEntity {
  customerId: string;
  lines: QuoteLine[];
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired';
  pricingContext: PricingContext;
  totalPrice?: Money;
}

interface QuoteLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}
```

### Pricing
```ts
interface PricingContext {
  pricingDate: string;
  currencyCode: 'USD';
  dealerId?: string;
  agencyId?: string;
  contractId?: string;
}

type PriceSourceType =
  | 'federal-signal-msrp'
  | 'dealer-cost'
  | 'dealer-contract'
  | 'promotional-bundle'
  | 'quantity-break'
  | 'quote'
  | 'manual';
```

### Vehicle
```ts
interface Vehicle extends BaseEntity {
  make: string;
  model: string;
  year: number;
  trim?: string;
  verticalId?: string;   // 'law' | 'fire' | 'work-truck'
}
```

### Configurator
The UTV/Vehicle configurator follows a strict workflow:
- Vehicle Selection → Single/Double Cab → Engine Size (Gas/Diesel/Electric) → Equipment
- If Skid selected → Law or Fire Skid config (end)
- If no Skid → EMS Skids (end)
```ts
interface ConfiguratorStep extends BaseEntity {
  required: boolean;
  options: ConfiguratorOption[];
}

interface ConfiguratorOption extends BaseEntity {
  sku: string;
  priceAdjustment?: Money;
  dependencyRules?: DependencyRule[];
}
```

---

## Shared Value Types

```ts
interface Money {
  amount: number;
  currencyCode: 'USD';
}

interface ImageAsset {
  src: string;
  alt: string;
  title?: string;
}

type Vertical = 'law' | 'fire' | 'work-truck';
type CustomLabel = 'Law' | 'Fire' | 'Work Truck';
```

---

## Cross-App Compatibility Rules

When Blair builds a new app, it must check this registry and apply these rules:

| New App Needs | Reuse From Registry | Do NOT Reinvent |
|---|---|---|
| Customer data | `Customer` schema | A new "User" or "Contact" entity |
| Product catalog | `Product` + `Category` + `Vertical` | A new "Item" or "SKU" entity |
| Quoting | `Quote` + `QuoteLine` + `PricingContext` | A new pricing model |
| Vehicle selection | `Vehicle` + `Fitment` | A new vehicle entity |
| Package building | `Package` + `PackageLine` | A new "bundle" or "kit" entity |
| Commerce/Cart | `VariantMapping` + `CartLineDraft` | A new cart schema |
