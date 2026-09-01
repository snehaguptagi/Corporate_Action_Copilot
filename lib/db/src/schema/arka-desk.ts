import { bigint, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const arkaMutualFundSchemesTable = pgTable("arka_mutual_fund_schemes", {
  id: text("id").primaryKey(),
  schemeCode: text("scheme_code").notNull().unique(),
  schemeName: text("scheme_name").notNull(),
  category: text("category").notNull(),
  aumPaise: bigint("aum_paise", { mode: "bigint" }).notNull(),
  navPaise: integer("nav_paise").notNull(),
  cashBudgetPaise: bigint("cash_budget_paise", { mode: "bigint" }),
  eligibilityStatus: text("eligibility_status").notNull(),
  exclusionReason: text("exclusion_reason"),
  decisionRights: bigint("decision_rights", { mode: "bigint" }),
});

export const arkaSchemeHoldingsTable = pgTable("arka_scheme_holdings", {
  id: text("id").primaryKey(),
  schemeId: text("scheme_id").notNull(),
  folio: text("folio").notNull(),
  quantity: bigint("quantity", { mode: "bigint" }).notNull(),
  asOfDate: text("as_of_date").notNull(),
});

export const arkaDeskSubmissionsTable = pgTable("arka_desk_submissions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  submittedById: text("submitted_by_id").notNull(),
  submittedByName: text("submitted_by_name").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  checkedById: text("checked_by_id"),
  checkedByName: text("checked_by_name"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  decisionSnapshot: jsonb("decision_snapshot").$type<Record<string, unknown>>().notNull(),
});