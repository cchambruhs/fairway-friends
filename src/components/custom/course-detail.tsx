// @polsia:user-owned — course detail, contributor corrections and layout submissions.
'use client';

import { ArrowLeft, MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CourseFieldsForm, LayoutFieldsForm } from '@/components/custom/course-forms';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type Course,
  type CourseLayout,
  type CourseLayoutInput,
  CourseResponseSchema,
} from '@/lib/contracts/courses';

export function CourseDetail({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState(false);
  const [addingLayout, setAddingLayout] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/courses/${encodeURIComponent(courseId)}`, {
        schema: CourseResponseSchema,
      });
      setCourse(response.course);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Course details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  async function saveCourse(values: { name: string; location: string }) {
    const response = await apiFetch(`/api/courses/${encodeURIComponent(courseId)}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
      schema: CourseResponseSchema,
    });
    setCourse(response.course);
    setEditingCourse(false);
    toast.success('Course details updated.');
  }

  async function saveLayout(layoutId: string, values: CourseLayoutInput) {
    const response = await apiFetch(
      `/api/courses/${encodeURIComponent(courseId)}/layouts/${encodeURIComponent(layoutId)}`,
      { method: 'PATCH', body: JSON.stringify(values), schema: CourseResponseSchema },
    );
    setCourse(response.course);
    setEditingLayoutId(null);
    toast.success('Layout details updated.');
  }

  async function addLayout(values: CourseLayoutInput) {
    const response = await apiFetch(`/api/courses/${encodeURIComponent(courseId)}/layouts`, {
      method: 'POST',
      body: JSON.stringify(values),
      schema: CourseResponseSchema,
    });
    setCourse(response.course);
    setAddingLayout(false);
    toast.success('Playable layout added.');
  }

  if (loading) return <output className="ff-course-state">Loading course details…</output>;
  if (error || !course) {
    return (
      <div className="ff-course-state ff-course-state-error" role="alert">
        <p>{error ?? 'Course not found.'}</p>
        <Button type="button" variant="outline" onClick={() => void loadCourse()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="ff-course-detail">
      <Link className="ff-course-back" href="/dashboard/courses">
        <ArrowLeft aria-hidden="true" /> Back to courses
      </Link>

      <section className="ff-course-detail-heading">
        <div>
          <p className="ff-course-eyebrow">COURSE DETAILS</p>
          <h1>{course.name}</h1>
          <p className="ff-course-location">
            <MapPin aria-hidden="true" />
            {course.location}
          </p>
        </div>
        {course.canEdit && !editingCourse && (
          <Button type="button" variant="outline" onClick={() => setEditingCourse(true)}>
            Edit course
          </Button>
        )}
      </section>

      {editingCourse && (
        <section className="ff-course-panel" aria-labelledby="edit-course-heading">
          <h2 id="edit-course-heading">Correct course details</h2>
          <CourseFieldsForm
            initialName={course.name}
            initialLocation={course.location}
            submitLabel="Save course"
            onSave={saveCourse}
            onCancel={() => setEditingCourse(false)}
          />
        </section>
      )}

      <section className="ff-course-layouts" aria-labelledby="layouts-heading">
        <div className="ff-course-section-heading">
          <div>
            <p className="ff-course-eyebrow">PLAYABLE DETAILS</p>
            <h2 id="layouts-heading">Layouts and hole pars</h2>
          </div>
          {!addingLayout && (
            <Button type="button" variant="outline" onClick={() => setAddingLayout(true)}>
              <Plus aria-hidden="true" /> Add a layout
            </Button>
          )}
        </div>

        {addingLayout && (
          <section className="ff-course-panel" aria-labelledby="add-layout-heading">
            <h3 id="add-layout-heading">Add a playable layout</h3>
            <p className="ff-course-form-note">Enter every supplied hole par in playing order.</p>
            <LayoutFieldsForm
              initialName=""
              initialPars={[]}
              submitLabel="Save layout"
              onSave={addLayout}
              onCancel={() => setAddingLayout(false)}
            />
          </section>
        )}

        {course.layouts.length ? (
          <div className="ff-course-layout-list">
            {course.layouts.map((layout) => (
              <LayoutCard
                key={layout.id}
                layout={layout}
                editing={editingLayoutId === layout.id}
                onEdit={() => setEditingLayoutId(layout.id)}
                onCancel={() => setEditingLayoutId(null)}
                onSave={(values) => saveLayout(layout.id, values)}
              />
            ))}
          </div>
        ) : (
          <div className="ff-course-empty ff-course-empty-compact">
            <h3>No playable layouts have been added yet</h3>
            <p>A layout appears here after its supplied hole pars are entered.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function LayoutCard({
  layout,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  layout: CourseLayout;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: CourseLayoutInput) => Promise<void>;
}) {
  return (
    <article className="ff-course-layout-card">
      <div className="ff-course-layout-card-heading">
        <div>
          <h3>{layout.name}</h3>
          <p>{layout.holes.length} holes</p>
        </div>
        {layout.canEdit && !editing && (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            Edit layout
          </Button>
        )}
      </div>
      {editing ? (
        <LayoutFieldsForm
          initialName={layout.name}
          initialPars={layout.holes.map((hole) => hole.par)}
          submitLabel="Save layout"
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : (
        <ol className="ff-course-hole-list" aria-label={`${layout.name} hole pars`}>
          {layout.holes.map((hole) => (
            <li key={hole.id}>
              <span>{hole.number}</span>
              <span>Par {hole.par}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
