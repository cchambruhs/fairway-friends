// @polsia:user-owned — staff course corrections and reversible archive controls.
'use client';

import { Archive, RotateCcw } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CourseFieldsForm, LayoutFieldsForm } from '@/components/custom/course-forms';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type AdminCourseMutation,
  AdminCourseMutationSchema,
  type Course,
  type CourseLayoutInput,
  CourseListResponseSchema,
  CourseResponseSchema,
} from '@/lib/contracts/courses';

export function CourseAdmin() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/admin/courses', { schema: CourseListResponseSchema });
      setCourses(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Course records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  function replaceCourse(updated: Course) {
    setCourses(
      (current) =>
        current?.map((course) => (course.id === updated.id ? updated : course)) ?? current,
    );
  }

  async function mutate(payload: AdminCourseMutation) {
    const input = AdminCourseMutationSchema.parse(payload);
    const response = await apiFetch('/api/admin/courses', {
      method: 'PATCH',
      body: JSON.stringify(input),
      schema: CourseResponseSchema,
    });
    replaceCourse(response.course);
    return response.course;
  }

  async function saveCourse(courseId: string, values: { name: string; location: string }) {
    await mutate({ action: 'update-course', courseId, ...values });
    toast.success('Course corrected.');
  }

  async function saveLayout(courseId: string, layoutId: string, layout: CourseLayoutInput) {
    await mutate({ action: 'update-layout', courseId, layoutId, layout });
    toast.success('Layout corrected.');
  }

  async function saveHoleLengths(
    courseId: string,
    layoutId: string,
    holes: Array<{ id: string; lengthFeet: number | null }>,
  ) {
    await mutate({ action: 'update-hole-lengths', courseId, layoutId, holes });
    toast.success('Verified course hole lengths saved.');
  }

  async function setArchived(course: Course, archive: boolean) {
    if (
      archive &&
      !window.confirm(`Archive ${course.name}? The course and its layouts will be retained.`)
    )
      return;
    await mutate({ action: archive ? 'archive' : 'restore', courseId: course.id });
    toast.success(
      archive ? 'Course archived. Its records were retained.' : 'Course restored to the directory.',
    );
  }

  return (
    <div className="ff-course-admin">
      <div className="ff-course-admin-intro">
        <p>The directory is not preloaded. Only course facts supplied by players appear here.</p>
      </div>

      {loading ? (
        <output className="ff-course-state">Loading course records…</output>
      ) : error ? (
        <div className="ff-course-state ff-course-state-error" role="alert">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={() => void loadCourses()}>
            Try again
          </Button>
        </div>
      ) : courses?.length ? (
        <div className="ff-course-admin-list">
          {courses.map((course) => (
            <article
              key={course.id}
              className={`ff-course-admin-card${course.archivedAt ? ' is-archived' : ''}`}
            >
              <div className="ff-course-admin-card-heading">
                <div>
                  <p className="ff-course-eyebrow">
                    {course.archivedAt ? 'ARCHIVED COURSE' : 'ACTIVE COURSE'}
                  </p>
                  <h2>{course.name}</h2>
                  <p>{course.location}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={course.archivedAt ? undefined : 'ff-course-archive-button'}
                  onClick={() =>
                    void setArchived(course, !course.archivedAt).catch((reason: unknown) =>
                      toast.error(
                        reason instanceof Error ? reason.message : 'Course update failed.',
                      ),
                    )
                  }
                >
                  {course.archivedAt ? (
                    <RotateCcw aria-hidden="true" />
                  ) : (
                    <Archive aria-hidden="true" />
                  )}
                  {course.archivedAt ? 'Restore' : 'Archive'}
                </Button>
              </div>

              <CourseFieldsForm
                initialName={course.name}
                initialLocation={course.location}
                submitLabel="Save course"
                onSave={(values) => saveCourse(course.id, values)}
              />

              <div className="ff-course-admin-layouts">
                <h3>Layouts and hole pars</h3>
                {course.layouts.length ? (
                  course.layouts.map((layout) => (
                    <section key={layout.id} className="ff-course-admin-layout">
                      <div>
                        <h4>{layout.name}</h4>
                        <p>{layout.holes.map((hole) => hole.par).join(', ')}</p>
                      </div>
                      <LayoutFieldsForm
                        initialName={layout.name}
                        initialPars={layout.holes.map((hole) => hole.par)}
                        submitLabel="Save layout"
                        onSave={(values) => saveLayout(course.id, layout.id, values)}
                      />
                      <VerifiedHoleLengthsForm
                        key={layout.holes
                          .map((hole) => `${hole.id}:${hole.lengthFeet ?? ''}`)
                          .join('|')}
                        holes={layout.holes}
                        onSave={(holes) => saveHoleLengths(course.id, layout.id, holes)}
                      />
                    </section>
                  ))
                ) : (
                  <p className="ff-course-help">No playable layout has been supplied.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ff-course-empty">
          <p className="ff-course-eyebrow">NO COURSE RECORDS</p>
          <h2>Nothing to manage yet</h2>
          <p>
            Courses added by players will appear here for staff corrections and archive actions.
          </p>
        </div>
      )}
    </div>
  );
}

function VerifiedHoleLengthsForm({
  holes,
  onSave,
}: {
  holes: Course['layouts'][number]['holes'];
  onSave: (holes: Array<{ id: string; lengthFeet: number | null }>) => Promise<void>;
}) {
  const [values, setValues] = useState(() =>
    holes.map((hole) => ({
      id: hole.id,
      lengthFeet: hole.lengthFeet === null ? '' : String(hole.lengthFeet),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = values.map((hole) => ({
      id: hole.id,
      lengthFeet: hole.lengthFeet.trim() ? Number(hole.lengthFeet) : null,
    }));
    if (
      parsed.some(
        (hole) =>
          hole.lengthFeet !== null &&
          (!Number.isInteger(hole.lengthFeet) || hole.lengthFeet < 1 || hole.lengthFeet > 10000),
      )
    ) {
      setError('Use a whole-number length from 1 to 10,000 feet, or leave a hole blank.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hole lengths could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ff-course-form" onSubmit={(event) => void submit(event)}>
      <div>
        <h4>Verified hole lengths</h4>
        <p className="ff-course-help">
          Enter published course lengths in feet. Saving a value verifies it for Global Stats; blank
          holes stay excluded.
        </p>
      </div>
      <div className="ff-course-length-grid">
        {values.map((hole, index) => (
          <label key={hole.id}>
            Hole {index + 1}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              step={1}
              value={hole.lengthFeet}
              onChange={(event) =>
                setValues((current) =>
                  current.map((entry) =>
                    entry.id === hole.id
                      ? { ...entry, lengthFeet: event.currentTarget.value }
                      : entry,
                  ),
                )
              }
              aria-label={`Verified length in feet for hole ${index + 1}`}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="ff-course-field-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? 'Saving…' : 'Save verified lengths'}
      </Button>
    </form>
  );
}
