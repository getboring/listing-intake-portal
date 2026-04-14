import { relations } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// 1. users - internal staff and seller-auth identities
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    role: text("role", { enum: ["admin", "agent", "coordinator", "seller"] }).notNull(),
    email: text("email").unique(),
    phone: text("phone"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({ orgIdIdx: index("users_org_id_idx").on(table.orgId) })
);

// 2. clients - seller customer identity
export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    primaryContactUserId: text("primary_contact_user_id"),
    clientType: text("client_type", {
      enum: ["individual", "couple", "trust", "estate", "llc"],
    }).notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({ orgIdIdx: index("clients_org_id_idx").on(table.orgId) })
);

// 3. client_contacts - multiple owners/sellers
export const clientContacts = sqliteTable(
  "client_contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    relationType: text("relation_type", {
      enum: ["owner", "spouse", "executor", "attorney", "trustee"],
    }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({ clientIdIdx: index("client_contacts_client_id_idx").on(table.clientId) })
);

// 4. properties - canonical property
export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    street1: text("street_1").notNull(),
    street2: text("street_2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    county: text("county"),
    parcelNumber: text("parcel_number"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    universalPropertyIdentifier: text("universal_property_identifier"),
    streetNumber: text("street_number"),
    streetName: text("street_name"),
    streetDirPrefix: text("street_dir_prefix"),
    streetDirSuffix: text("street_dir_suffix"),
    streetAdditionalInfo: text("street_additional_info"),
    stateOrProvince: text("state_or_province"),
    countyOrParish: text("county_or_parish"),
    country: text("country").default("US"),
    propertySubType: text("property_sub_type"),
    propertyType: text("property_type", {
      enum: ["residential", "land", "commercial", "multifamily"],
    }),
    occupancyStatus: text("occupancy_status", {
      enum: ["owner_occupied", "tenant_occupied", "vacant"],
    }),
    yearBuilt: integer("year_built"),
    lotSizeArea: real("lot_size_area"),
    livingArea: real("living_area"),
    lotSizeUnits: text("lot_size_units").default("Square Feet"),
    livingAreaUnits: text("living_area_units").default("Square Feet"),
    bedroomsTotal: integer("bedrooms_total"),
    bathroomsTotalInteger: integer("bathrooms_total_integer"),
    publicRecordJson: text("public_record_json").$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({ orgIdIdx: index("properties_org_id_idx").on(table.orgId) })
);

// 5. listing_intakes - main workflow record
export const listingIntakes = sqliteTable(
  "listing_intakes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    propertyId: text("property_id").notNull(),
    clientId: text("client_id").notNull(),
    assignedAgentId: text("assigned_agent_id"),
    assignedCoordinatorId: text("assigned_coordinator_id"),
    intakeNumber: text("intake_number").unique().notNull(),
    status: text("status").notNull(),
    currentStage: text("current_stage").notNull(),
    completionPercent: real("completion_percent").notNull().default(0),
    readinessScore: real("readiness_score").notNull().default(0),
    targetListDate: text("target_list_date"),
    listPrice: integer("list_price"),
    standardStatus: text("standard_status", { enum: ["Active", "Pending", "Closed", "Withdrawn", "Expired", "Canceled", "ComingSoon", "Hold"] }),
    listingContractDate: text("listing_contract_date"),
    modificationTimestamp: integer("modification_timestamp", { mode: "timestamp" }),
    originatingSystemName: text("originating_system_name").default("listing-intake-portal"),
    originatingSystemKey: text("originating_system_key"),
    sellerMotivation: text("seller_motivation"),
    source: text("source"),
    metadataJson: text("metadata_json").$type<Record<string, unknown>>(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("listing_intakes_org_id_idx").on(table.orgId),
    propertyIdIdx: index("listing_intakes_property_id_idx").on(table.propertyId),
    clientIdIdx: index("listing_intakes_client_id_idx").on(table.clientId),
  })
);

// 6. listing_intake_sections - per-section payload
export const listingIntakeSections = sqliteTable(
  "listing_intake_sections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    intakeId: text("intake_id").notNull(),
    sectionKey: text("section_key").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    payloadJson: text("payload_json").$type<Record<string, unknown>>().notNull(),
    validationJson: text("validation_json").$type<Record<string, unknown>>(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    intakeSectionUnique: unique("listing_intake_sections_intake_id_section_key_unique").on(
      table.intakeId,
      table.sectionKey
    ),
    intakeIdIdx: index("listing_intake_sections_intake_id_idx").on(table.intakeId),
  })
);

// 7. documents - uploaded artifacts
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    intakeId: text("intake_id"),
    propertyId: text("property_id"),
    clientId: text("client_id"),
    uploadedByUserId: text("uploaded_by_user_id"),
    documentType: text("document_type", {
      enum: [
        "deed",
        "survey",
        "disclosure",
        "utility_bill",
        "hoa_doc",
        "floorplan",
        "photo",
        "other",
      ],
    }).notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    fileSizeBytes: blob("file_size_bytes", { mode: "bigint" }),
    checksumSha256: text("checksum_sha256"),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    extractedJson: text("extracted_json").$type<Record<string, unknown>>(),
    resoMediaJson: text("reso_media_json").$type<{ ResourceName?: string; MediaCategory?: string; MediaType?: string; MediaURL?: string; Order?: number; ShortDescription?: string }>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("documents_org_id_idx").on(table.orgId),
    intakeIdIdx: index("documents_intake_id_idx").on(table.intakeId),
    propertyIdIdx: index("documents_property_id_idx").on(table.propertyId),
    clientIdIdx: index("documents_client_id_idx").on(table.clientId),
  })
);

// 8. tasks - operational work
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    intakeId: text("intake_id").notNull(),
    propertyId: text("property_id").notNull(),
    assignedToUserId: text("assigned_to_user_id"),
    taskType: text("task_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    priority: text("priority").notNull().default("normal"),
    dueAt: integer("due_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("tasks_org_id_idx").on(table.orgId),
    intakeIdIdx: index("tasks_intake_id_idx").on(table.intakeId),
    propertyIdIdx: index("tasks_property_id_idx").on(table.propertyId),
  })
);

// 9. events - immutable domain events
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull(),
    payloadJson: text("payload_json").$type<Record<string, unknown>>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("events_org_id_idx").on(table.orgId),
    aggregateIdIdx: index("events_aggregate_id_idx").on(table.aggregateId), // generic fallback for event streaming
  })
);

// 10. messages - communication log
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id").notNull(),
    intakeId: text("intake_id"),
    conversationId: text("conversation_id"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    channel: text("channel", { enum: ["email", "sms", "portal"] }).notNull(),
    providerMessageId: text("provider_message_id"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    subject: text("subject"),
    bodyText: text("body_text"),
    deliveryStatus: text("delivery_status"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("messages_org_id_idx").on(table.orgId),
    intakeIdIdx: index("messages_intake_id_idx").on(table.intakeId),
    conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId),
  })
);

// 11. checklist_items - required workflow checks
export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    intakeId: text("intake_id").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    status: text("status", {
      enum: ["pending", "satisfied", "waived", "blocked"],
    }).notNull(),
    source: text("source", {
      enum: ["rule_engine", "manual", "template"],
    }).notNull(),
    satisfiedAt: integer("satisfied_at", { mode: "timestamp" }),
  },
  (table) => ({
    intakeItemUnique: unique("checklist_items_intake_id_item_key_unique").on(
      table.intakeId,
      table.itemKey
    ),
    intakeIdIdx: index("checklist_items_intake_id_idx").on(table.intakeId),
  })
);

// ------------------------------------------------------------------
// Relations
// ------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  assignedIntakesAsAgent: many(listingIntakes, {
    relationName: "intakeAssignedAgent",
  }),
  assignedIntakesAsCoordinator: many(listingIntakes, {
    relationName: "intakeAssignedCoordinator",
  }),
  uploadedDocuments: many(documents),
  assignedTasks: many(tasks),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  primaryContactUser: one(users, {
    fields: [clients.primaryContactUserId],
    references: [users.id],
  }),
  contacts: many(clientContacts),
  intakes: many(listingIntakes),
  documents: many(documents),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));

export const propertiesRelations = relations(properties, ({ many }) => ({
  intakes: many(listingIntakes),
  documents: many(documents),
  tasks: many(tasks),
}));

export const listingIntakesRelations = relations(
  listingIntakes,
  ({ one, many }) => ({
    property: one(properties, {
      fields: [listingIntakes.propertyId],
      references: [properties.id],
    }),
    client: one(clients, {
      fields: [listingIntakes.clientId],
      references: [clients.id],
    }),
    assignedAgent: one(users, {
      fields: [listingIntakes.assignedAgentId],
      references: [users.id],
      relationName: "intakeAssignedAgent",
    }),
    assignedCoordinator: one(users, {
      fields: [listingIntakes.assignedCoordinatorId],
      references: [users.id],
      relationName: "intakeAssignedCoordinator",
    }),
    sections: many(listingIntakeSections),
    documents: many(documents),
    tasks: many(tasks),
    messages: many(messages),
    checklistItems: many(checklistItems),
  })
);

export const listingIntakeSectionsRelations = relations(
  listingIntakeSections,
  ({ one }) => ({
    intake: one(listingIntakes, {
      fields: [listingIntakeSections.intakeId],
      references: [listingIntakes.id],
    }),
  })
);

export const documentsRelations = relations(documents, ({ one }) => ({
  intake: one(listingIntakes, {
    fields: [documents.intakeId],
    references: [listingIntakes.id],
  }),
  property: one(properties, {
    fields: [documents.propertyId],
    references: [properties.id],
  }),
  client: one(clients, {
    fields: [documents.clientId],
    references: [clients.id],
  }),
  uploadedByUser: one(users, {
    fields: [documents.uploadedByUserId],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  intake: one(listingIntakes, {
    fields: [tasks.intakeId],
    references: [listingIntakes.id],
  }),
  property: one(properties, {
    fields: [tasks.propertyId],
    references: [properties.id],
  }),
  assignedToUser: one(users, {
    fields: [tasks.assignedToUserId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  intake: one(listingIntakes, {
    fields: [messages.intakeId],
    references: [listingIntakes.id],
  }),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  intake: one(listingIntakes, {
    fields: [checklistItems.intakeId],
    references: [listingIntakes.id],
  }),
}));

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type ClientContact = typeof clientContacts.$inferSelect;
export type NewClientContact = typeof clientContacts.$inferInsert;

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

export type ListingIntake = typeof listingIntakes.$inferSelect;
export type NewListingIntake = typeof listingIntakes.$inferInsert;

export type ListingIntakeSection = typeof listingIntakeSections.$inferSelect;
export type NewListingIntakeSection = typeof listingIntakeSections.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
