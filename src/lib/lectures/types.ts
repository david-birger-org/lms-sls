export interface LectureRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pdf_data: Buffer;
  cover_image_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LectureSummary {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
}

export interface LectureDetail extends LectureSummary {
  pdfBase64: string;
}
