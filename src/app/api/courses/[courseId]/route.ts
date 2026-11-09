// @polsia:user-owned — player course detail and submitter-only corrections.
import 'server-only';
import { NextResponse } from 'next/server';
import { coursePlayer, ownsCourseRecord } from '@/lib/business/course-access';
import { courseWithLayouts, serializeCourse } from '@/lib/business/course-directory';
import { UpdateCourseRequestSchema } from '@/lib/contracts/courses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const { courseId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, archivedAt: null },
    include: courseWithLayouts,
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  return NextResponse.json({ course: serializeCourse(course, user.id) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const input = UpdateCourseRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const { courseId } = await params;
  const existing = await prisma.course.findFirst({
    where: { id: courseId, archivedAt: null },
    select: { id: true, createdByUserId: true },
  });
  if (!existing) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (!ownsCourseRecord(existing.createdByUserId, user.id)) {
    return NextResponse.json(
      { error: 'Only the course submitter or staff can edit this course.' },
      { status: 403 },
    );
  }

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      name: input.data.name,
      location: input.data.location,
      updatedByUserId: user.id,
    },
    include: courseWithLayouts,
  });
  return NextResponse.json({ course: serializeCourse(course, user.id) });
}
