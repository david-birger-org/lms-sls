import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalUser } from "../../src/lib/internal-auth-user.js";
import {
  selectActiveLectures,
  selectLectureBySlug,
} from "../../src/lib/lectures/queries.js";
import { json } from "../../src/lib/response.js";
import { hasActiveFeature } from "../../src/lib/user-features/queries.js";

const LECTURES_FEATURE = "lectures";

export async function GET(request: Request) {
  const auth = await requireTrustedInternalUser(request);
  if (!auth.ok) return auth.response;

  const hasAccess = await hasActiveFeature(auth.user.userId, LECTURES_FEATURE);

  if (!hasAccess)
    return json({ error: "No access to lectures." }, { status: 403 });

  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim();

    if (!slug) {
      const rows = await selectActiveLectures();
      const lectures = rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        description: r.description,
        coverImageUrl: r.cover_image_url,
      }));
      return json({ lectures });
    }

    const lecture = await selectLectureBySlug(slug);
    if (!lecture) return json({ error: "Lecture not found." }, { status: 404 });

    return json({
      lecture: {
        slug: lecture.slug,
        title: lecture.title,
        description: lecture.description,
        coverImageUrl: lecture.cover_image_url,
        content: lecture.content,
      },
    });
  } catch (error) {
    return json(
      { error: `Failed to fetch lectures: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
