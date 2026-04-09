import { getDatabase } from "../database.js";
import type { LectureRow } from "./types.js";

export async function selectActiveLectures() {
  const database = getDatabase();

  return database<
    Pick<LectureRow, "slug" | "title" | "description" | "cover_image_url">[]
  >`
    select slug, title, description, cover_image_url
    from lectures
    where active = true
    order by sort_order asc, created_at asc
  `;
}

export async function selectLectureBySlug(slug: string) {
  const database = getDatabase();

  const rows = await database<
    Pick<
      LectureRow,
      "slug" | "title" | "description" | "content" | "cover_image_url"
    >[]
  >`
    select slug, title, description, content, cover_image_url
    from lectures
    where slug = ${slug}
      and active = true
    limit 1
  `;

  return rows[0] ?? null;
}
