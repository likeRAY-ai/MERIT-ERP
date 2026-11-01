// MERIT-ERP 資料庫結構
// 金額一律以新台幣「元」整數儲存，售價皆為含稅價。
import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ───────── 帳號 ─────────

// OWNER 老闆：全部權限、帳號管理、看成本與毛利
// STAFF 店員：進貨、銷貨、基本資料，看不到成本
// ACCOUNTANT 會計：查詢與報表，看得到成本
export const roleEnum = pgEnum("role", ["OWNER", "STAFF", "ACCOUNTANT"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("STAFF"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────── 基本資料 ─────────

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sort: integer("sort").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull().unique(), // 商品編號
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    brand: text("brand"),
    spec: text("spec"), // 規格說明
    unit: text("unit").notNull().default("個"),
    categoryId: integer("category_id").references(() => categories.id),
    trackSerial: boolean("track_serial").notNull().default(false), // 是否需要序號管理
    warrantyMonths: integer("warranty_months").notNull().default(12), // 保固月數
    retailPrice: integer("retail_price").notNull().default(0), // 零售價（含稅）
    businessPrice: integer("business_price").notNull().default(0), // 公司行號價（含稅），0 表示同零售價
    avgCost: integer("avg_cost").notNull().default(0), // 平均成本（含稅），進貨時自動更新
    stockQty: integer("stock_qty").notNull().default(0), // 目前庫存
    safetyStock: integer("safety_stock").notNull().default(0), // 安全庫存
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_name_idx").on(t.name)],
);

// PERSONAL 一般消費者、COMPANY 公司行號
export const customerTypeEnum = pgEnum("customer_type", ["PERSONAL", "COMPANY"]);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    type: customerTypeEnum("type").notNull().default("PERSONAL"),
    name: text("name").notNull(),
    taxId: text("tax_id"), // 統一編號
    contact: text("contact"), // 聯絡人
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_name_idx").on(t.name), index("customers_phone_idx").on(t.phone)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    contact: text("contact"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

// ───────── 進貨 ─────────

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // 進貨單號，例如 P20261101-001
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  total: integer("total").notNull().default(0),
  note: text("note"),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: integer("qty").notNull(),
  unitCost: integer("unit_cost").notNull(),
  subtotal: integer("subtotal").notNull(),
});

// ───────── 銷貨 ─────────

// CASH 現金、CARD 刷卡、TRANSFER 轉帳、CREDIT 月結
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "CARD", "TRANSFER", "CREDIT"]);

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // 銷貨單號，例如 S20261101-001
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  customerId: integer("customer_id").references(() => customers.id), // 空白表示門市散客
  buyerTaxId: text("buyer_tax_id"), // 發票統編
  total: integer("total").notNull().default(0), // 含稅總額
  taxAmount: integer("tax_amount").notNull().default(0), // 其中稅額（5%）
  costTotal: integer("cost_total").notNull().default(0), // 成本合計
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("CASH"),
  note: text("note"),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: integer("qty").notNull(),
  unitPrice: integer("unit_price").notNull(),
  unitCost: integer("unit_cost").notNull(), // 銷售當下的平均成本，用來算毛利
  subtotal: integer("subtotal").notNull(),
});

// ───────── 序號 ─────────

// IN_STOCK 在庫、SOLD 已售出、RETURNED 退回、RMA 維修中、SCRAPPED 報廢
export const serialStatusEnum = pgEnum("serial_status", [
  "IN_STOCK",
  "SOLD",
  "RETURNED",
  "RMA",
  "SCRAPPED",
]);

export const serialNumbers = pgTable(
  "serial_numbers",
  {
    id: serial("id").primaryKey(),
    serial: text("serial").notNull(),
    productId: integer("product_id").notNull().references(() => products.id),
    status: serialStatusEnum("status").notNull().default("IN_STOCK"),
    purchaseItemId: integer("purchase_item_id").references(() => purchaseItems.id),
    saleItemId: integer("sale_item_id").references(() => saleItems.id),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    warrantyUntil: timestamp("warranty_until", { withTimezone: true }), // 對客戶的保固到期日
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("serial_product_unique").on(t.productId, t.serial),
    index("serial_idx").on(t.serial),
  ],
);

// ───────── 庫存異動 ─────────

// PURCHASE 進貨、SALE 銷貨、ADJUST 手動調整
export const movementTypeEnum = pgEnum("movement_type", ["PURCHASE", "SALE", "ADJUST"]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id),
    type: movementTypeEnum("type").notNull(),
    qty: integer("qty").notNull(), // 正數增加、負數減少
    balanceAfter: integer("balance_after").notNull(),
    unitCost: integer("unit_cost").notNull(),
    refNumber: text("ref_number"), // 對應單號
    note: text("note"),
    createdById: integer("created_by_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movements_product_idx").on(t.productId, t.createdAt)],
);

// ───────── 關聯（查詢用） ─────────

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  serials: many(serialNumbers),
  movements: many(stockMovements),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  createdBy: one(users, { fields: [purchases.createdById], references: [users.id] }),
  items: many(purchaseItems),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one, many }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
  serials: many(serialNumbers),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  createdBy: one(users, { fields: [sales.createdById], references: [users.id] }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one, many }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
  serials: many(serialNumbers),
}));

export const serialNumbersRelations = relations(serialNumbers, ({ one }) => ({
  product: one(products, { fields: [serialNumbers.productId], references: [products.id] }),
  purchaseItem: one(purchaseItems, {
    fields: [serialNumbers.purchaseItemId],
    references: [purchaseItems.id],
  }),
  saleItem: one(saleItems, { fields: [serialNumbers.saleItemId], references: [saleItems.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  createdBy: one(users, { fields: [stockMovements.createdById], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({ sales: many(sales) }));
export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchases: many(purchases),
}));
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));
