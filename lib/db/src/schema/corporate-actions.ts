import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const corporateActionEventsTable = pgTable("corporate_action_events", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});