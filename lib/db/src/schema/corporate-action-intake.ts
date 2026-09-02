import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const corporateActionIntakeDraftsTable = pgTable("corporate_action_intake_drafts", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Single-row store of the most recent public web discovery search, so the
// Corporate actions tab can show the last fetch and its results across sessions.
export const discoverySearchesTable = pgTable("corporate_action_discovery_searches", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
});