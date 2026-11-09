// @polsia:user-owned — layout submitter-only corrections.
import 'server-only';
import { NextResponse } from 'next/server';
import { coursePlayer, ownsCourseRecord } from '@/lib/business/course-access';
import {
  courseWithLayouts,
  saveLayoutPars,
  serializeCourse,
} from '@/lib/business/course-directory';
import { CourseLayoutInputSchema } from '@/lib/contracts/courses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ courseId: string; layoutId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const input = CourseLayoutInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const { courseId, layoutId } = await params;
  const updated = await prisma.$transaction(async (transaction) => {
    const layout = await transaction.courseLayout.findFirst({
      where: { id: layoutId, courseId, course: { is: { archivedAt: null } } },
      select: { id: true, createdByUserId: true },
    });
    if (!layout) return { kind: 'missing' as const };
    if (!ownsCourseRecord(layout.createdByUserId, user.id)) return { kind: 'forbidden' as const };

    await transaction.courseLayout.update({
      where: { id: layoutId },
      data: { name: input.data.name, updatedByUserId: user.id },
    });
    await saveLayoutPars(transaction, layoutId, input.data.pars);

    const course = await transaction.course.findUnique({
      where: { id: courseId },
      include: courseWithLayouts,
    });
    return course ? { kind: 'saved' as const, course } : { kind: 'missing' as const };
  });

  if (updated.kind === 'missing') {
    return NextResponse.json({ error: 'Course or layout not found' }, { status: 404 });
  }
  if (updated.kind === 'forbidden') {
    return NextResponse.json(
      { error: 'Only the layout submitter or staff can edit this layout.' },
      { status: 403 },
    );
  }
  return NextResponse.json({ course: serializeCourse(updated.course, user.id) });
}
