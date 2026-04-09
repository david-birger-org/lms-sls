import { getDatabase } from "../database.js";
import type { UserFeatureRow } from "./types.js";

export async function selectActiveFeatures(authUserId: string) {
  const database = getDatabase();

  return database<Pick<UserFeatureRow, "feature" | "granted_at">[]>`
    select uf.feature, uf.granted_at
    from user_features uf
    inner join app_users au on au.id = uf.app_user_id
    where au.auth_user_id = ${authUserId}
      and uf.revoked_at is null
    order by uf.granted_at asc
  `;
}

export async function selectActiveFeaturesByAppUserId(appUserId: string) {
  const database = getDatabase();

  return database<Pick<UserFeatureRow, "feature" | "granted_at">[]>`
    select feature, granted_at
    from user_features
    where app_user_id = ${appUserId}
      and revoked_at is null
    order by granted_at asc
  `;
}

export async function hasActiveFeature(authUserId: string, feature: string) {
  const database = getDatabase();

  const rows = await database<{ id: string }[]>`
    select uf.id
    from user_features uf
    inner join app_users au on au.id = uf.app_user_id
    where au.auth_user_id = ${authUserId}
      and uf.feature = ${feature}
      and uf.revoked_at is null
    limit 1
  `;

  return rows.length > 0;
}

export async function grantUserFeature({
  authUserId,
  feature,
  grantedByAppUserId,
  paymentId,
}: {
  authUserId: string;
  feature: string;
  grantedByAppUserId?: string | null;
  paymentId?: string | null;
}) {
  const database = getDatabase();

  await database`
    insert into user_features (app_user_id, feature, granted_by, payment_id)
    select au.id, ${feature}, ${grantedByAppUserId ?? null}, ${paymentId ?? null}
    from app_users au
    where au.auth_user_id = ${authUserId}
    on conflict (app_user_id, feature)
    do update set
      revoked_at = null,
      granted_at = timezone('utc', now()),
      granted_by = excluded.granted_by,
      payment_id = coalesce(excluded.payment_id, user_features.payment_id)
  `;
}

export async function revokeUserFeature({
  authUserId,
  feature,
}: {
  authUserId: string;
  feature: string;
}) {
  const database = getDatabase();

  await database`
    update user_features uf
    set revoked_at = timezone('utc', now())
    from app_users au
    where au.id = uf.app_user_id
      and au.auth_user_id = ${authUserId}
      and uf.feature = ${feature}
      and uf.revoked_at is null
  `;
}

export async function grantUserFeatureByAppUserId({
  appUserId,
  feature,
  grantedByAppUserId,
  paymentId,
}: {
  appUserId: string;
  feature: string;
  grantedByAppUserId?: string | null;
  paymentId?: string | null;
}) {
  const database = getDatabase();

  await database`
    insert into user_features (app_user_id, feature, granted_by, payment_id)
    values (${appUserId}, ${feature}, ${grantedByAppUserId ?? null}, ${paymentId ?? null})
    on conflict (app_user_id, feature)
    do update set
      revoked_at = null,
      granted_at = timezone('utc', now()),
      granted_by = excluded.granted_by,
      payment_id = coalesce(excluded.payment_id, user_features.payment_id)
  `;
}
