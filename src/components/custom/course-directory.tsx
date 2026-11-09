// @polsia:user-owned — searchable signed-in player course directory.
'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NewCourseForm } from '@/components/custom/course-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import {
  type Course,
  CourseListResponseSchema,
  CourseResponseSchema,
} from '@/lib/contracts/courses';

export function CourseDirectory() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const query = appliedSearch ? `?q=${encodeURIComponent(appliedSearch)}` : '';
    apiFetch(`/api/courses${query}`, { schema: CourseListResponseSchema })
      .then((response) => {
        if (active) setCourses(response.items);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Course records could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedSearch]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchText.trim());
  }

  async function createCourse(values: {
    name: string;
    location: string;
    layout?: { name: string; pars: number[] };
  }) {
    const response = await apiFetch('/api/courses', {
      method: 'POST',
      body: JSON.stringify(values),
      schema: CourseResponseSchema,
    });
    setShowCreate(false);
    setSearchText(response.course.name);
    setAppliedSearch(response.course.name);
    toast.success('Course saved to the directory.');
  }

  return (
    <div className="ff-course-directory">
      <search aria-label="Search courses">
        <form className="ff-course-search" onSubmit={search}>
          <div className="ff-course-search-input">
            <label htmlFor="course-search">Search by course or location</label>
            <div className="ff-course-search-control">
              <Search aria-hidden="true" />
              <Input
                id="course-search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Course or location"
                maxLength={120}
              />
            </div>
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </search>

      <div className="ff-course-directory-actions">
        <p>
          Course details are player supplied. Add only names, locations, layouts, and pars you can
          confirm.
        </p>
        <Button type="button" onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? 'Close form' : 'Add a course'}
        </Button>
      </div>

      {showCreate && (
        <section
          className="ff-course-panel ff-course-create-panel"
          aria-labelledby="new-course-heading"
        >
          <div className="ff-course-panel-heading">
            <div>
              <p className="ff-course-eyebrow">PLAYER SUBMISSION</p>
              <h2 id="new-course-heading">Add a real course</h2>
            </div>
          </div>
          <NewCourseForm onSave={createCourse} onCancel={() => setShowCreate(false)} />
        </section>
      )}

      {loading ? (
        <output className="ff-course-state">Loading course directory…</output>
      ) : error ? (
        <p className="ff-course-state ff-course-state-error" role="alert">
          {error}
        </p>
      ) : courses?.length ? (
        <ul className="ff-course-list" aria-label="Courses">
          {courses.map((course) => (
            <li key={course.id}>
              <Link className="ff-course-result" href={`/dashboard/courses/${course.id}`}>
                <span className="ff-course-result-copy">
                  <span className="ff-course-result-name">{course.name}</span>
                  <span className="ff-course-result-location">{course.location}</span>
                </span>
                <span className="ff-course-result-meta">
                  {course.layouts.length
                    ? `${course.layouts.length} ${course.layouts.length === 1 ? 'playable layout' : 'playable layouts'}`
                    : 'No playable layouts yet'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <output className="ff-course-empty">
          <p className="ff-course-eyebrow">NO COURSE RECORDS</p>
          <h2>
            {appliedSearch ? 'No matching course found' : 'The directory is ready for real courses'}
          </h2>
          <p>
            {appliedSearch
              ? 'Try another course name or location, or add a course you can confirm.'
              : 'No course names, locations, layouts, or pars have been supplied yet. Add a course when you have its details.'}
          </p>
        </output>
      )}
    </div>
  );
}
