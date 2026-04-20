import type { ContactRequestRecord, ContactRequestRow } from "./types.js";

export {
  insertContactRequest,
  selectContactRequests,
  updateContactRequestProcessed,
} from "./queries.js";
export type {
  ContactRequestRecord,
  ContactRequestRow,
  ContactRequestType,
  CreateContactRequestInput,
} from "./types.js";

export function toContactRequestRecord(
  row: ContactRequestRow,
): ContactRequestRecord {
  return {
    id: row.id,
    requestType: row.request_type,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    country: row.country,
    phone: row.phone,
    preferredContactMethod: row.preferred_contact_method,
    social: row.social,
    message: row.message,
    service: row.service,
    processed: row.processed,
    processedAt: row.processed_at,
    processedBy: row.processed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
