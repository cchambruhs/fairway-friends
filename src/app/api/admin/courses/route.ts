// @polsia:user-owned — staff-only course correction and reversible archive actions.
import 'server-only';
import { NextResponse } from 'next/server';
import { courseAdmin } from '@/lib/business/course-access';
import {
  courseWithLayouts,
  saveLayoutPars,
  serializeCourse,
} from '@/lib/business/course-directory';
import { AdminCourseMutationSchema, CourseListResponseSchema } from '@/lib/contracts/courses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await courseAdmin();
  if (admin instanceof Response) return admin;

  const courses = await prisma.course.findMany({
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }, { location: 'asc' }],
    include: courseWithLayouts,
  });
  return NextResponse.json(
    CourseListResponseSchema.parse({
      items: courses.map((course) => serializeCourse(course, admin.id, true)),
    }),
  );
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = await courseAdmin();
  if (admin instanceof Response) return admin;

  const input = AdminCourseMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const mutation = input.data;

    if (mutation.action === 'update-course') {
      const exists = await transaction.course.findUnique({
        where: { id: mutation.courseId },
        select: { id: true },
      });
      if (!exists) return null;
      await transaction.course.update({
        where: { id: mutation.courseId },
        data: {
          name: mutation.name,
          location: mutation.location,
          updatedByUserId: admin.id,
        },
      });
    } else if (mutation.action === 'update-layout') {
      const layout = await transaction.courseLayout.findFirst({
        where: { id: mutation.layoutId, courseId: mutation.courseId },
        select: { id: true },
      });
      if (!layout) return null;
      await transaction.courseLayout.update({
        where: { id: mutation.layoutId },
        data: {
          name: mutation.layout.name,
          updatedByUserId: admin.id,
        },
      });
      await saveLayoutPars(transaction, mutation.layoutId, mutation.layout.pars);
      await transaction.course.update({
        where: { id: mutation.courseId },
        data: { updatedByUserId: admin.id },
      });
    } else if (mutation.action === 'update-hole-lengths') {
      const layout = await transaction.courseLayout.findFirst({
        where: { id: mutation.layoutId, courseId: mutation.courseId },
        include: { holes: { select: { id: true } } },
      });
      if (!layout) return null;
      const existingIds = new Set(layout.holes.map((hole) => hole.id));
      if (
        mutation.holes.length !== existingIds.size ||
        mutation.holes.some((hole) => !existingIds.has(hole.id))
      )
        return null;
      for (const hole of mutation.holes) {
        await transaction.courseHole.update({
          where: { id: hole.id },
          data: {
            lengthFeet: hole.lengthFeet,
            lengthVerifiedAt: hole.lengthFeet === null ? null : new Date(),
            lengthVerifiedByUserId: hole.lengthFeet === null ? null : admin.id,
          },
        });
      }
      await transaction.courseLayout.update({
        where: { id: mutation.layoutId },
        data: { updatedByUserId: admin.id },
      });
      await transaction.course.update({
        where: { id: mutation.courseId },
        data: { updatedByUserId: admin.id },
      });
    } else if (mutation.action === 'archive') {
      const archived = await transaction.course.updateMany({
        where: { id: mutation.courseId, archivedAt: null },
        data: { archivedAt: new Date(), archivedByUserId: admin.id, updatedByUserId: admin.id },
      });
      if (archived.count === 0) return null;
    } else {
      const restored = await transaction.course.updateMany({
        where: { id: mutation.courseId, archivedAt: { not: null } },
        data: { archivedAt: null, archivedByUserId: null, updatedByUserId: admin.id },
      });
      if (restored.count === 0) return null;
    }

    return transaction.course.findUnique({
      where: { id: mutation.courseId },
      include: courseWithLayouts,
    });
  });

  if (!result) return NextResponse.json({ error: 'Course or layout not found' }, { status: 404 });
  return NextResponse.json({ course: serializeCourse(result, admin.id, true) });
}
