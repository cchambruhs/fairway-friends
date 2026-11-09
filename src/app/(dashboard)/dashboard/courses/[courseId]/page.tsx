// @polsia:user-owned — signed-in player course and layout details.
import type { Metadata } from 'next';
import { CourseDetail } from '@/components/custom/course-detail';

export const metadata: Metadata = {
  title: 'Course details',
  description: 'View supplied course locations, playable layouts, and hole pars.',
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <div className="ff-course-page">
      <CourseDetail courseId={courseId} />
    </div>
  );
}
