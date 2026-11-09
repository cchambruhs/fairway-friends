// @polsia:user-owned — signed-in players can add a complete playable layout.
import 'server-only';
import { NextResponse } from 'next/server';
import { coursePlayer } from '@/lib/business/course-access';
import { courseWithLayouts, serializeCourse } from '@/lib/business/course-directory';
import { CourseLayoutInputSchema } from '@/lib/contracts/courses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const input = CourseLayoutInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const { courseId } = await params;
  const course = await prisma.$transaction(async (transaction) => {
    const activeCourse = await transaction.course.findFirst({
      where: { id: courseId, archivedAt: null },
      select: { id: true },
    });
    if (!activeCourse) return null;

    await transaction.courseLayout.create({
      data: {
        courseId,
        name: input.data.name,
        createdByUserId: user.id,
        holes: {
          create: input.data.pars.map((par, index) => ({ number: index + 1, par })),
        },
      },
    });

    return transaction.course.findUnique({
      where: { id: courseId },
      include: courseWithLayouts,
    });
  });

  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json({ course: serializeCourse(course, user.id) }, { status: 201 });
}
