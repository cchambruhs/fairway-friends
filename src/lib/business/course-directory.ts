// @polsia:user-owned — course serialization and data helpers for route handlers.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { CourseSchema } from '@/lib/contracts/courses';

export const courseWithLayouts = {
  layouts: {
    orderBy: { createdAt: 'asc' },
    include: { holes: { orderBy: { number: 'asc' } } },
  },
} satisfies Prisma.CourseInclude;

export type CourseWithLayouts = Prisma.CourseGetPayload<{
  include: typeof courseWithLayouts;
}>;

export function serializeCourse(course: CourseWithLayouts, userId: string, canManageAll = false) {
  return CourseSchema.parse({
    id: course.id,
    name: course.name,
    location: course.location,
    canEdit: canManageAll || course.createdByUserId === userId,
    archivedAt: course.archivedAt?.toISOString() ?? null,
    layouts: course.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      canEdit: canManageAll || layout.createdByUserId === userId,
      holes: layout.holes.map((hole) => ({
        id: hole.id,
        number: hole.number,
        par: hole.par,
        lengthFeet: hole.lengthFeet,
        lengthVerified: Boolean(
          hole.lengthFeet && hole.lengthVerifiedAt && hole.lengthVerifiedByUserId,
        ),
      })),
    })),
  });
}

export async function saveLayoutPars(
  transaction: Prisma.TransactionClient,
  layoutId: string,
  pars: number[],
) {
  for (const [index, par] of pars.entries()) {
    const number = index + 1;
    await transaction.courseHole.upsert({
      where: { layoutId_number: { layoutId, number } },
      update: { par },
      create: { layoutId, number, par },
    });
  }

  await transaction.courseHole.deleteMany({
    where: { layoutId, number: { gt: pars.length } },
  });
}
