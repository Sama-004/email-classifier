import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

// just an example from drizzle documentation

export const emails = pgTable("emails", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  messageId: varchar("message_id").unique(),
  sender: varchar("sender").notNull(),
  subject: varchar("subject"),
  timestamp: integer("timestamp").notNull(), //unix timestamp
  category: varchar("category").notNull().default("Uncategorized"),
});
