// @polsia:user-owned — accessible course and playable-layout entry forms.
'use client';

import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type CourseLayoutInput,
  CourseLayoutInputSchema,
  CreateCourseRequestSchema,
  UpdateCourseRequestSchema,
} from '@/lib/contracts/courses';

type CourseValues = { name: string; location: string };
type CourseCreateValues = CourseValues & { layout?: CourseLayoutInput };
type SaveCourse = (values: CourseValues) => Promise<void>;
type SaveNewCourse = (values: CourseCreateValues) => Promise<void>;
type SaveLayout = (values: CourseLayoutInput) => Promise<void>;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save these details. Try again.';
}

function parsFromText(value: string): number[] {
  if (!value.trim()) return [];
  return value.split(',').map((part) => Number(part.trim()));
}

export function NewCourseForm({
  onSave,
  onCancel,
}: {
  onSave: SaveNewCourse;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [addLayout, setAddLayout] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [pars, setPars] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const values = {
      name,
      location,
      ...(addLayout ? { layout: { name: layoutName, pars: parsFromText(pars) } } : {}),
    };
    const input = CreateCourseRequestSchema.safeParse(values);
    const courseValidation = UpdateCourseRequestSchema.safeParse({ name, location });
    const layoutValidation = addLayout
      ? CourseLayoutInputSchema.safeParse({ name: layoutName, pars: parsFromText(pars) })
      : null;
    if (!input.success || !courseValidation.success || layoutValidation?.success === false) {
      const courseIssues = courseValidation.success
        ? {}
        : courseValidation.error.flatten().fieldErrors;
      const layoutIssues =
        layoutValidation && !layoutValidation.success
          ? layoutValidation.error.flatten().fieldErrors
          : {};
      setFieldErrors({
        name: courseIssues.name?.[0] ?? '',
        location: courseIssues.location?.[0] ?? '',
        layoutName: layoutIssues.name?.[0] ?? '',
        pars: layoutIssues.pars?.[0] ?? '',
      });
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      await onSave(input.data);
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ff-course-form" onSubmit={submit}>
      <div className="ff-course-form-grid">
        <div className="ff-course-field">
          <label htmlFor={`${id}-course-name`}>Course name</label>
          <Input
            id={`${id}-course-name`}
            autoComplete="off"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? `${id}-course-name-error` : undefined}
            required
          />
          {fieldErrors.name && (
            <p id={`${id}-course-name-error`} className="ff-course-field-error">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="ff-course-field">
          <label htmlFor={`${id}-course-location`}>Location</label>
          <Input
            id={`${id}-course-location`}
            autoComplete="off"
            maxLength={180}
            placeholder="Use the supplied city or location label"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            aria-invalid={Boolean(fieldErrors.location)}
            aria-describedby={fieldErrors.location ? `${id}-course-location-error` : undefined}
            required
          />
          {fieldErrors.location && (
            <p id={`${id}-course-location-error`} className="ff-course-field-error">
              {fieldErrors.location}
            </p>
          )}
        </div>
      </div>

      <label className="ff-course-checkbox" htmlFor={`${id}-include-first-layout`}>
        <input
          id={`${id}-include-first-layout`}
          type="checkbox"
          checked={addLayout}
          onChange={(event) => setAddLayout(event.target.checked)}
        />
        <span>Add a playable layout now</span>
      </label>

      {addLayout && (
        <div className="ff-course-form-grid">
          <div className="ff-course-field">
            <label htmlFor={`${id}-layout-name`}>Layout name</label>
            <Input
              id={`${id}-layout-name`}
              autoComplete="off"
              maxLength={100}
              value={layoutName}
              onChange={(event) => setLayoutName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.layoutName)}
              aria-describedby={fieldErrors.layoutName ? `${id}-layout-name-error` : undefined}
              required
            />
            {fieldErrors.layoutName && (
              <p id={`${id}-layout-name-error`} className="ff-course-field-error">
                {fieldErrors.layoutName}
              </p>
            )}
          </div>
          <div className="ff-course-field">
            <label htmlFor={`${id}-layout-pars`}>Hole pars, in order</label>
            <Input
              id={`${id}-layout-pars`}
              inputMode="numeric"
              placeholder="For example: 3, 3, 4, 3"
              value={pars}
              onChange={(event) => setPars(event.target.value)}
              aria-invalid={Boolean(fieldErrors.pars)}
              aria-describedby={`${id}-layout-pars-help ${id}-layout-pars-error`}
              required
            />
            <p id={`${id}-layout-pars-help`} className="ff-course-help">
              Enter one supplied par per hole, separated by commas.
            </p>
            {fieldErrors.pars && (
              <p id={`${id}-layout-pars-error`} className="ff-course-field-error">
                {fieldErrors.pars}
              </p>
            )}
          </div>
        </div>
      )}

      <p className="ff-course-form-note">
        Only add course facts you can confirm from the course or its published information.
      </p>
      {error && (
        <p className="ff-course-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="ff-course-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save course'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CourseFieldsForm({
  initialName,
  initialLocation,
  submitLabel,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialLocation: string;
  submitLabel: string;
  onSave: SaveCourse;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = UpdateCourseRequestSchema.safeParse({ name, location });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'Check the course name and location.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSave(input.data);
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ff-course-form" onSubmit={submit}>
      <div className="ff-course-form-grid">
        <div className="ff-course-field">
          <label htmlFor={`${id}-course-name`}>Course name</label>
          <Input
            id={`${id}-course-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="ff-course-field">
          <label htmlFor={`${id}-course-location`}>Location</label>
          <Input
            id={`${id}-course-location`}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={180}
            required
          />
        </div>
      </div>
      {error && (
        <p className="ff-course-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="ff-course-form-actions">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function LayoutFieldsForm({
  initialName,
  initialPars,
  submitLabel,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialPars: number[];
  submitLabel: string;
  onSave: SaveLayout;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [pars, setPars] = useState(initialPars.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = CourseLayoutInputSchema.safeParse({ name, pars: parsFromText(pars) });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'Check the layout name and hole pars.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSave(input.data);
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ff-course-form ff-course-layout-form" onSubmit={submit}>
      <div className="ff-course-form-grid">
        <div className="ff-course-field">
          <label htmlFor={`${id}-layout-name`}>Layout name</label>
          <Input
            id={`${id}-layout-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className="ff-course-field">
          <label htmlFor={`${id}-layout-pars`}>Hole pars, in order</label>
          <Input
            id={`${id}-layout-pars`}
            inputMode="numeric"
            value={pars}
            onChange={(event) => setPars(event.target.value)}
            aria-describedby={`${id}-layout-pars-help`}
            required
          />
          <p id={`${id}-layout-pars-help`} className="ff-course-help">
            Enter one supplied par per hole, separated by commas.
          </p>
        </div>
      </div>
      {error && (
        <p className="ff-course-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="ff-course-form-actions">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
