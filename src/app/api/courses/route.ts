// @polsia:user-owned — authenticated course directory and player submissions.
import 'server-only';
import { NextResponse } from 'next/server';
import { coursePlayer } from '@/lib/business/course-access';
import { courseWithLayouts, serializeCourse } from '@/lib/business/course-directory';
import { CourseListResponseSchema, CreateCourseRequestSchema } from '@/lib/contracts/courses';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) ?? '';
  const courses = await prisma.course.findMany({
    where: {
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }, { location: 'asc' }],
    include: courseWithLayouts,
  });

  const response = CourseListResponseSchema.parse({
    items: courses.map((course) => serializeCourse(course, user.id)),
  });
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await coursePlayer(request);
  if (user instanceof Response) return user;

  const input = CreateCourseRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const course = await prisma.course.create({
    data: {
      name: input.data.name,
      location: input.data.location,
      createdByUserId: user.id,
      ...(input.data.layout
        ? {
            layouts: {
              create: {
                name: input.data.layout.name,
                createdByUserId: user.id,
                holes: {
                  create: input.data.layout.pars.map((par, index) => ({
                    number: index + 1,
                    par,
                  })),
                },
              },
            },
          }
        : {}),
    },
    include: courseWithLayouts,
  });

  return NextResponse.json({ course: serializeCourse(course, user.id) }, { status: 201 });
}
