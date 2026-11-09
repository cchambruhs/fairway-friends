// @polsia:user-owned — shared contract for player and staff course workflows.
import { z } from 'zod';

const CourseNameSchema = z.string().trim().min(1, 'Enter a course name.').max(120);
const CourseLocationSchema = z
  .string()
  .trim()
  .min(1, 'Enter the supplied course location.')
  .max(180);
const LayoutNameSchema = z.string().trim().min(1, 'Enter a layout name.').max(100);

export const CourseHoleSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1).max(36),
  par: z.number().int().min(1).max(20),
  lengthFeet: z.number().int().positive().nullable(),
  lengthVerified: z.boolean(),
});

export const CourseLayoutSchema = z.object({
  id: z.string(),
  name: LayoutNameSchema,
  canEdit: z.boolean(),
  holes: z.array(CourseHoleSchema).min(1).max(36),
});

export const CourseSchema = z.object({
  id: z.string(),
  name: CourseNameSchema,
  location: CourseLocationSchema,
  canEdit: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  layouts: z.array(CourseLayoutSchema),
});

export const CourseListResponseSchema = z.object({ items: z.array(CourseSchema) });
export const CourseResponseSchema = z.object({ course: CourseSchema });

export const CourseLayoutInputSchema = z.object({
  name: LayoutNameSchema,
  pars: z.array(z.number().int().min(1).max(20)).min(1, 'Enter at least one hole par.').max(36),
});

export const CreateCourseRequestSchema = z.object({
  name: CourseNameSchema,
  location: CourseLocationSchema,
  layout: CourseLayoutInputSchema.optional(),
});

export const UpdateCourseRequestSchema = z.object({
  name: CourseNameSchema,
  location: CourseLocationSchema,
});

export const AdminCourseMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update-course'),
    courseId: z.string().min(1),
    name: CourseNameSchema,
    location: CourseLocationSchema,
  }),
  z.object({
    action: z.literal('update-layout'),
    courseId: z.string().min(1),
    layoutId: z.string().min(1),
    layout: CourseLayoutInputSchema,
  }),
  z.object({
    action: z.literal('update-hole-lengths'),
    courseId: z.string().min(1),
    layoutId: z.string().min(1),
    holes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            lengthFeet: z.number().int().min(1).max(10000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(36),
  }),
  z.object({ action: z.literal('archive'), courseId: z.string().min(1) }),
  z.object({ action: z.literal('restore'), courseId: z.string().min(1) }),
]);

export type Course = z.infer<typeof CourseSchema>;
export type CourseLayout = z.infer<typeof CourseLayoutSchema>;
export type CourseLayoutInput = z.infer<typeof CourseLayoutInputSchema>;
export type AdminCourseMutation = z.infer<typeof AdminCourseMutationSchema>;
