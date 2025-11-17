// Roles del sistema
export enum UserRole {
  ADMIN = 'admin',
  DOCENTE = 'docente',
  ESTUDIANTE = 'estudiante',
  WORKER = 'worker'
}

// Estados de procesamiento
export enum ProcessingStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Tipos de exámenes
export enum ExamType {
  TEORICO = 'teorico',
  PRACTICO = 'practico',
  MIXTO = 'mixto'
}

// Tipos de preguntas
export enum QuestionType {
  TEXT = 'text',
  CODE = 'code',
  DIAGRAM = 'diagram'
}

// Request user extendido con JWT
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Payload de JWT
export interface JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Respuesta API estándar
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

// Configuración de paginación
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Respuesta paginada
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}

// Configuración de Cloudinary
export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

// Request body para procesamiento de exámenes
export interface ProcessExamRequest {
  examId: string;
  studentId: string;
  filePath: string;
  rubric: Record<string, any>;
}

// Respuesta del motor IA
export interface AIProcessingResult {
  examId: string;
  studentId: string;
  score: number;
  maxScore: number;
  perQuestion: QuestionResult[];
  feedback: string;
  processingTime: number;
}

export interface QuestionResult {
  questionId: string;
  score: number;
  maxScore: number;
  feedback: string;
  confidence: number;
}

// Configuración de límites de cuota
export interface QuotaLimits {
  cloudinaryCredits: number;
  geminiTokens: number;
  openaiTokens: number;
  processingsPerDay: number;
}
