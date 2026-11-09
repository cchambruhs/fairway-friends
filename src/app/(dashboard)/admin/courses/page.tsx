// @polsia:user-owned — protected staff course maintenance surface.
import type { Metadata } from 'next';
import { CourseAdmin } from '@/components/custom/course-admin';

export const metadata: Metadata = {
  title: 'Course management',
  description:
    'Correct or archive course and layout records in the protected Fairway Friends staff area.',
};

export default function AdminCoursesPage() {
  return (
    <div className="ff-course-page ff-course-admin-page">
      <header className="ff-course-page-heading">
        <p className="ff-course-eyebrow">FAIRWAY FRIENDS · STAFF AREA</p>
        <h1>Course management</h1>
        <p>
          Correct player-submitted course information and retain layouts when archiving a record.
        </p>
      </header>
      <CourseAdmin />
    </div>
  );
}
