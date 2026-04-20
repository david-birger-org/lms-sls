import { getDatabase } from "../database.js";
import type { ContactRequestRow, CreateContactRequestInput } from "./types.js";

const CONTACT_REQUEST_COLUMNS = [
  "id",
  "request_type",
  "first_name",
  "last_name",
  "email",
  "country",
  "phone",
  "preferred_contact_method",
  "social",
  "message",
  "service",
  "processed",
  "processed_at",
  "processed_by",
  "created_at",
  "updated_at",
].join(", ");

export async function insertContactRequest(input: CreateContactRequestInput) {
  const database = getDatabase();
  const rows = await database.unsafe<ContactRequestRow[]>(
    `
      insert into contact_requests (
        request_type, first_name, last_name, email, country, phone,
        preferred_contact_method, social, message, service
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning ${CONTACT_REQUEST_COLUMNS}
    `,
    [
      input.requestType,
      input.firstName ?? null,
      input.lastName ?? null,
      input.email ?? null,
      input.country ?? null,
      input.phone ?? null,
      input.preferredContactMethod ?? null,
      input.social ?? null,
      input.message ?? null,
      input.service ?? null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to insert contact request.");
  return row;
}

export async function selectContactRequests() {
  const database = getDatabase();
  return database.unsafe<ContactRequestRow[]>(
    `select ${CONTACT_REQUEST_COLUMNS} from contact_requests order by created_at desc`,
  );
}

export async function updateContactRequestProcessed({
  id,
  processed,
  processedBy,
}: {
  id: string;
  processed: boolean;
  processedBy: string | null;
}) {
  const database = getDatabase();
  const rows = await database.unsafe<ContactRequestRow[]>(
    `
      update contact_requests
      set
        processed = $2,
        processed_at = case when $2 then timezone('utc', now()) else null end,
        processed_by = case when $2 then $3::uuid else null end,
        updated_at = timezone('utc', now())
      where id = $1
      returning ${CONTACT_REQUEST_COLUMNS}
    `,
    [id, processed, processedBy],
  );

  return rows[0] ?? null;
}
