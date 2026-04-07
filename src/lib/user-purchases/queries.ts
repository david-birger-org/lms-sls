import { getDatabase } from "../database.js";

export interface UserPurchaseRow {
  id: string;
  status: string;
  amount_minor: number | string;
  final_amount_minor: number | string | null;
  currency: string;
  description: string;
  created_at: string;
  updated_at: string;
  product_id: string | null;
  product_slug: string | null;
  product_name_uk: string | null;
  product_name_en: string | null;
  product_image_url: string | null;
}

export async function selectUserPurchases(authUserId: string) {
  const database = getDatabase();

  return database<UserPurchaseRow[]>`
    select
      p.id,
      p.status,
      p.amount_minor,
      p.final_amount_minor,
      p.currency,
      p.description,
      p.created_at,
      p.updated_at,
      p.product_id,
      pr.slug as product_slug,
      pr.name_uk as product_name_uk,
      pr.name_en as product_name_en,
      pr.image_url as product_image_url
    from payments p
    inner join app_users au on au.id = p.user_id
    left join products pr on pr.id = p.product_id
    where au.auth_user_id = ${authUserId}
    order by p.created_at desc
  `;
}
