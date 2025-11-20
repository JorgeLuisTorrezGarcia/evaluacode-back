import { prisma } from '@/lib/prisma';
import { CustomError } from '@/middleware/errorHandler';
import { UserRole } from '@/types';

interface EnrollmentParams {
  courseId: string;
  studentId: string;
}

export async function createEnrollmentForCourse({ courseId, studentId }: EnrollmentParams) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      isActive: true
    }
  });

  if (!course || !course.isActive) {
    throw new CustomError('Course not found or inactive', 404);
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      role: {
        select: {
          name: true
        }
      }
    }
  });

  if (!student || student.role?.name !== UserRole.ESTUDIANTE) {
    throw new CustomError('Student not found or invalid role', 400);
  }

  const existingEnrollment = await prisma.courseEnrollment.findUnique({
    where: {
      courseId_studentId: {
        courseId,
        studentId
      }
    }
  });

  if (existingEnrollment) {
    throw new CustomError('Student already enrolled in this course', 400);
  }

  return prisma.courseEnrollment.create({
    data: {
      courseId,
      studentId,
      enrolledAt: new Date()
    },
    include: {
      course: {
        select: {
          id: true,
          nombre: true,
          codigo: true
        }
      },
      student: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });
}
