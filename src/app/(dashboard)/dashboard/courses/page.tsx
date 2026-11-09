// @polsia:user-owned — signed-in player course directory.
import type { Metadata } from 'next';
import { CourseDirectory } from '@/components/custom/course-directory';

export const metadata: Metadata = {
  title: 'Course directory',
  description:
    'Search player-supplied disc golf course details and playable layouts in Fairway Friends.',
};

export default function CoursesPage() {
  return (
    <div className="ff-course-page">
      <header className="ff-course-page-heading">
        <p className="ff-course-eyebrow">FAIRWAY FRIENDS · PLAYER DIRECTORY</p>
        <h1>Find your next course</h1>
        <p>
          Search real course details shared by players, including layouts with supplied hole pars.
        </p>
      </header>
      <CourseDirectory />
    </div>
  );
}
