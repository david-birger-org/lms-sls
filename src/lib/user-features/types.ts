export interface UserFeatureRow {
  id: string;
  app_user_id: string;
  feature: string;
  granted_by: string | null;
  payment_id: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface ActiveFeature {
  feature: string;
  grantedAt: string;
}
