import { PrismaClient, Prisma } from '@prisma/client';
import type { Role, User, Course, Exam } from '@prisma/client';
import { ExamType, UserRole } from '../src/types';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type RoleMap = Record<UserRole, Role>;
type SeedUserKey =
  | 'admin'
  | 'docenteLuis'
  | 'docenteAna'
  | 'studentMariana'
  | 'studentCarlos'
  | 'studentSofia';
type SeedCourseKey = 'progAvanzada' | 'basesDatos' | 'iaIntro';

async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  return { passwordHash, salt };
}

async function ensureRoles(): Promise<RoleMap> {
  console.log('📝 Creating roles...');
  const roleNames: UserRole[] = [
    UserRole.ADMIN,
    UserRole.DOCENTE,
    UserRole.ESTUDIANTE,
    UserRole.WORKER
  ];

  const roles: Partial<RoleMap> = {};
  for (const roleName of roleNames) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName }
    });
    roles[roleName] = role;
    console.log(`  • Role ready: ${role.name}`);
  }

  return roles as RoleMap;
}

async function ensureAIModels() {
  console.log('🤖 Ensuring AI models...');
  const aiModels = [
    {
      name: 'tesseract',
      version: '5.0',
      type: 'ocr',
      isActive: true,
      configJson: {
        language: 'spa+eng',
        psm: 6,
        confidence_threshold: 80
      },
      performanceMetrics: {
        accuracy: 0.85,
        speed_ms: 200
      }
    },
    {
      name: 'sentence-transformers',
      version: '2.2.2',
      type: 'semantic',
      modelPath: 'all-MiniLM-L6-v2',
      isActive: true,
      configJson: {
        similarity_threshold: 0.75,
        max_sequence_length: 256
      }
    },
    {
      name: 'gemini',
      version: '1.5-flash',
      type: 'semantic',
      isActive: true,
      configJson: {
        temperature: 0.2,
        max_tokens: 1000,
        model: 'gemini-1.5-flash'
      }
    }
  ];

  for (const modelData of aiModels) {
    await prisma.aIModel.upsert({
      where: {
        name_version: {
          name: modelData.name,
          version: modelData.version
        }
      },
      update: {
        isActive: modelData.isActive,
        configJson: modelData.configJson as Prisma.JsonObject,
        performanceMetrics:
          (modelData.performanceMetrics as Prisma.JsonObject | undefined) ?? {}
      },
      create: modelData
    });
  }
}

async function ensureUsers(roleMap: RoleMap): Promise<Record<SeedUserKey, User>> {
  console.log('👥 Creating baseline users...');

  const userConfigs: Record<SeedUserKey, { email: string; password: string; role: UserRole }> = {
    admin: {
      email: 'admin@evaluacode.com',
      password: 'Admin123!',
      role: UserRole.ADMIN
    },
    docenteLuis: {
      email: 'profesorluis@universidad.edu',
      password: 'SecurePass123!',
      role: UserRole.DOCENTE
    },
    docenteAna: {
      email: 'profesoraana@universidad.edu',
      password: 'SecurePass123!',
      role: UserRole.DOCENTE
    },
    studentMariana: {
      email: 'mariana.estudiante@universidad.edu',
      password: 'Student123!',
      role: UserRole.ESTUDIANTE
    },
    studentCarlos: {
      email: 'carlos.estudiante@universidad.edu',
      password: 'Student123!',
      role: UserRole.ESTUDIANTE
    },
    studentSofia: {
      email: 'sofia.estudiante@universidad.edu',
      password: 'Student123!',
      role: UserRole.ESTUDIANTE
    }
  };

  const users: Partial<Record<SeedUserKey, User>> = {};

  for (const [key, config] of Object.entries(userConfigs) as [SeedUserKey, typeof userConfigs[SeedUserKey]][]) {
    const role = roleMap[config.role];
    const { passwordHash, salt } = await hashPassword(config.password);

    const user = await prisma.user.upsert({
      where: { email: config.email },
      update: {
        passwordHash,
        salt,
        roleId: role.id,
        isVerified: true,
        lastLogin: new Date()
      },
      create: {
        email: config.email,
        passwordHash,
        salt,
        roleId: role.id,
        isVerified: true,
        lastLogin: new Date()
      }
    });

    users[key] = user;
    console.log(`  • User ready: ${config.email} (${config.role})`);
  }

  return users as Record<SeedUserKey, User>;
}

async function ensureCourses(users: Record<SeedUserKey, User>): Promise<Record<SeedCourseKey, Course>> {
  console.log('📚 Creating courses...');

  const coursesConfig: Record<SeedCourseKey, {
    codigo: string;
    nombre: string;
    descripcion: string;
    periodo: string;
    semestre: number;
    creditos: number;
    docenteKey: SeedUserKey;
    isActive?: boolean;
  }> = {
    progAvanzada: {
      codigo: 'PROG301',
      nombre: 'Programación Avanzada',
      descripcion: 'Profundización en diseño de algoritmos, estructuras de datos avanzadas y patrones de diseño.',
      periodo: '2024-1',
      semestre: 3,
      creditos: 4,
      docenteKey: 'docenteLuis',
      isActive: true
    },
    basesDatos: {
      codigo: 'DB202',
      nombre: 'Fundamentos de Bases de Datos',
      descripcion: 'Modelado relacional, SQL avanzado y optimización de consultas.',
      periodo: '2024-1',
      semestre: 2,
      creditos: 3,
      docenteKey: 'docenteAna',
      isActive: true
    },
    iaIntro: {
      codigo: 'IA101',
      nombre: 'Introducción a la Inteligencia Artificial',
      descripcion: 'Conceptos básicos de IA, búsqueda heurística y fundamentos de machine learning.',
      periodo: '2024-2',
      semestre: 4,
      creditos: 4,
      docenteKey: 'docenteLuis',
      isActive: true
    }
  };

  const courses: Partial<Record<SeedCourseKey, Course>> = {};

  for (const [key, config] of Object.entries(coursesConfig) as [SeedCourseKey, typeof coursesConfig[SeedCourseKey]][]) {
    const docente = users[config.docenteKey];

    const course = await prisma.course.upsert({
      where: { codigo: config.codigo },
      update: {
        nombre: config.nombre,
        descripcion: config.descripcion,
        periodo: config.periodo,
        semestre: config.semestre,
        creditos: config.creditos,
        docenteId: docente.id,
        isActive: config.isActive ?? true
      },
      create: {
        codigo: config.codigo,
        nombre: config.nombre,
        descripcion: config.descripcion,
        periodo: config.periodo,
        semestre: config.semestre,
        creditos: config.creditos,
        docenteId: docente.id,
        isActive: config.isActive ?? true
      }
    });

    courses[key] = course;
    console.log(`  • Course ready: ${course.nombre} (${course.codigo})`);
  }

  return courses as Record<SeedCourseKey, Course>;
}

async function ensureEnrollments(courses: Record<SeedCourseKey, Course>, users: Record<SeedUserKey, User>) {
  console.log('🧾 Enrolling students...');

  const enrollments: Array<{ courseKey: SeedCourseKey; studentKeys: SeedUserKey[]; status?: string }> = [
    {
      courseKey: 'progAvanzada',
      studentKeys: ['studentMariana', 'studentCarlos']
    },
    {
      courseKey: 'basesDatos',
      studentKeys: ['studentMariana', 'studentSofia']
    },
    {
      courseKey: 'iaIntro',
      studentKeys: ['studentCarlos', 'studentSofia']
    }
  ];

  for (const enrollment of enrollments) {
    const course = courses[enrollment.courseKey];
    for (const studentKey of enrollment.studentKeys) {
      const student = users[studentKey];
      await prisma.courseEnrollment.upsert({
        where: {
          courseId_studentId: {
            courseId: course.id,
            studentId: student.id
          }
        },
        update: {
          status: enrollment.status ?? 'active'
        },
        create: {
          courseId: course.id,
          studentId: student.id,
          status: enrollment.status ?? 'active'
        }
      });
      console.log(`  • ${student.email} ↔ ${course.nombre}`);
    }
  }
}

async function ensureExams(
  courses: Record<SeedCourseKey, Course>,
  users: Record<SeedUserKey, User>
): Promise<Record<string, Exam>> {
  console.log('📝 Creating exams and questions...');

  const examConfigs = [
    {
      title: 'Examen Parcial de Programación Avanzada',
      descripcion: 'Evaluación teórico-práctica sobre estructuras de datos, complejidad y patrones.',
      courseKey: 'progAvanzada' as SeedCourseKey,
      docenteKey: 'docenteLuis' as SeedUserKey,
      type: ExamType.MIXTO,
      fechaApertura: new Date('2025-03-10T14:00:00Z'),
      fechaCierre: new Date('2025-03-10T16:00:00Z'),
      duracionMinutos: 120,
      intentosPermitidos: 1,
      puntuacionMaxima: 100,
      configuracion: {
        shuffleQuestions: true,
        showResults: false,
        requireProctoring: false,
        allowLateSubmission: false
      },
      questions: [
        { pageNumber: 1, tipo: 'code', puntos: 40, orden: 1 },
        { pageNumber: 1, tipo: 'text', puntos: 30, orden: 2 },
        { pageNumber: 2, tipo: 'text', puntos: 30, orden: 3 }
      ],
      submissions: [
        {
          studentKey: 'studentMariana' as SeedUserKey,
          finalScore: 87,
          maxScore: 100,
          submittedAt: new Date('2025-03-10T15:35:00Z')
        }
      ]
    },
    {
      title: 'Evaluación Final de Bases de Datos',
      descripcion: 'Examen teórico con consultas SQL, normalización y transacciones.',
      courseKey: 'basesDatos' as SeedCourseKey,
      docenteKey: 'docenteAna' as SeedUserKey,
      type: ExamType.TEORICO,
      fechaApertura: new Date('2025-06-20T13:00:00Z'),
      fechaCierre: new Date('2025-06-20T15:00:00Z'),
      duracionMinutos: 120,
      intentosPermitidos: 1,
      puntuacionMaxima: 90,
      configuracion: {
        shuffleQuestions: false,
        showResults: true,
        requireProctoring: false,
        allowLateSubmission: true
      },
      questions: [
        { pageNumber: 1, tipo: 'text', puntos: 20, orden: 1 },
        { pageNumber: 1, tipo: 'text', puntos: 35, orden: 2 },
        { pageNumber: 2, tipo: 'text', puntos: 35, orden: 3 }
      ],
      submissions: [
        {
          studentKey: 'studentSofia' as SeedUserKey,
          finalScore: 78,
          maxScore: 90,
          submittedAt: new Date('2025-06-20T14:45:00Z')
        }
      ]
    },
    {
      title: 'Proyecto Final de IA',
      descripcion: 'Entrega final con presentación de un modelo simple de machine learning.',
      courseKey: 'iaIntro' as SeedCourseKey,
      docenteKey: 'docenteLuis' as SeedUserKey,
      type: ExamType.PRACTICO,
      fechaApertura: new Date('2025-08-05T13:00:00Z'),
      fechaCierre: new Date('2025-08-12T23:59:59Z'),
      duracionMinutos: 0,
      intentosPermitidos: 2,
      puntuacionMaxima: 100,
      configuracion: {
        shuffleQuestions: false,
        showResults: true,
        requireProctoring: false,
        allowLateSubmission: false
      },
      questions: [
        { pageNumber: 1, tipo: 'code', puntos: 60, orden: 1 },
        { pageNumber: 1, tipo: 'code', puntos: 40, orden: 2 }
      ],
      submissions: []
    }
  ];

  const exams: Record<string, Exam> = {};

  for (const examConfig of examConfigs) {
    const course = courses[examConfig.courseKey];
    const docente = users[examConfig.docenteKey];

    const existing = await prisma.exam.findFirst({
      where: {
        courseId: course.id,
        title: examConfig.title
      }
    });

    const baseData = {
      courseId: course.id,
      title: examConfig.title,
      descripcion: examConfig.descripcion,
      type: examConfig.type,
      fechaApertura: examConfig.fechaApertura,
      fechaCierre: examConfig.fechaCierre,
      duracionMinutos: examConfig.duracionMinutos,
      puntuacionMaxima: examConfig.puntuacionMaxima,
      intentosPermitidos: examConfig.intentosPermitidos,
      configuracion: examConfig.configuracion as Prisma.JsonObject,
      isActive: true,
      status: 'published',
      createdById: docente.id
    };

    let exam: Exam;

    if (existing) {
      exam = await prisma.exam.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          questions: {
            deleteMany: {},
            create: examConfig.questions.map((question) => ({
              pageNumber: question.pageNumber,
              tipo: question.tipo,
              puntos: question.puntos,
              orden: question.orden
            }))
          }
        }
      });
      console.log(`  ↻ Exam updated: ${exam.title}`);
    } else {
      exam = await prisma.exam.create({
        data: {
          ...baseData,
          questions: {
            create: examConfig.questions.map((question) => ({
              pageNumber: question.pageNumber,
              tipo: question.tipo,
              puntos: question.puntos,
              orden: question.orden
            }))
          }
        }
      });
      console.log(`  ✅ Exam created: ${exam.title}`);
    }

    exams[exam.title] = exam;

    if (examConfig.submissions?.length) {
      for (const submission of examConfig.submissions) {
        const student = users[submission.studentKey];
        await prisma.submission.upsert({
          where: {
            examId_studentId: {
              examId: exam.id,
              studentId: student.id
            }
          },
          update: {
            finalScore: submission.finalScore,
            maxScore: submission.maxScore,
            submittedAt: submission.submittedAt ?? new Date()
          },
          create: {
            examId: exam.id,
            studentId: student.id,
            finalScore: submission.finalScore,
            maxScore: submission.maxScore,
            submittedAt: submission.submittedAt ?? new Date()
          }
        });
        console.log(`    • Submission: ${student.email} → ${exam.title}`);
      }
    }
  }

  return exams;
}

async function main() {
  console.log('🌱 Starting database seed...');

  const roles = await ensureRoles();
  await ensureAIModels();
  const users = await ensureUsers(roles);
  const courses = await ensureCourses(users);
  await ensureEnrollments(courses, users);
  await ensureExams(courses, users);

  console.log('✅ Database seed completed successfully!');
  console.log('ℹ️  Default credentials:');
  console.log('   • Admin: admin@evaluacode.com / Admin123!');
  console.log('   • Docente: profesorluis@universidad.edu / SecurePass123!');
  console.log('   • Docente: profesoraana@universidad.edu / SecurePass123!');
  console.log('   • Estudiante: mariana.estudiante@universidad.edu / Student123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
