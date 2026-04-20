export type ContactRequestType = "contact" | "service";

export interface ContactRequestRow {
  id: string;
  request_type: ContactRequestType;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  country: string | null;
  phone: string | null;
  preferred_contact_method: string | null;
  social: string | null;
  message: string | null;
  service: string | null;
  processed: boolean;
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRequestRecord {
  id: string;
  requestType: ContactRequestType;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  country: string | null;
  phone: string | null;
  preferredContactMethod: string | null;
  social: string | null;
  message: string | null;
  service: string | null;
  processed: boolean;
  processedAt: string | null;
  processedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactRequestInput {
  requestType: ContactRequestType;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  country?: string | null;
  phone?: string | null;
  preferredContactMethod?: string | null;
  social?: string | null;
  message?: string | null;
  service?: string | null;
}
