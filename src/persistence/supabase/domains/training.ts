// Gate S4 — training / learning domain mappings.
// Course, Student, Enrollment. (CourseSession, Assignment, LearningPath lack a
// dedicated zod schema and are deferred — boundary validates schema-backed only.)
import type { Course, Enrollment, Student } from "@/domain/types";
import { courseSchema, enrollmentSchema, studentSchema } from "@/domain/schemas";
import { defineMapping, fields, type AnyMapping } from "../mapping";

export const trainingMappings: AnyMapping[] = [
  defineMapping<Course>({
    collection: "courses",
    table: "courses",
    idPrefix: "co",
    schema: courseSchema,
    fields: fields({
      name: "name",
      type: "type",
      start: "start_date",
      end: "end_date",
      price: "price",
      status: "status",
      zoom: "zoom",
      instructorId: "instructor_id",
      isAI: "is_ai",
      blurb: "blurb",
    }),
  }),
  defineMapping<Student>({
    collection: "students",
    table: "students",
    idPrefix: "sd",
    schema: studentSchema,
    fields: fields({
      name: "name",
      phone: "phone",
      email: "email",
      userId: "user_id",
      status: "status",
    }),
  }),
  defineMapping<Enrollment>({
    collection: "enrollments",
    table: "enrollments",
    idPrefix: "en",
    schema: enrollmentSchema,
    fields: fields({
      studentId: "student_id",
      studentName: "student_name",
      courseId: "course_id",
      payment: "payment",
      stages: "stages",
    }),
  }),
];
