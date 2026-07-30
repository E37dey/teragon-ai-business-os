-- ============================================================================
-- 006_training.sql — TERAGON AI BUSINESS OS
-- Learning: courses, learning_paths, students, enrollments, course_sessions,
-- assignments.
-- Additive only. RLS enabled deny-by-default; policies are Gate S3.
--
-- StageProgress DECISION: StageProgress is embedded in the domain (Enrollment.stages
-- is StageProgress[], not its own node — no id/createdAt/updatedAt, no collection).
-- It is therefore stored as JSONB (enrollments.stages) rather than a child table.
-- Rationale: it is a value object owned entirely by its enrollment, always read
-- and written as a whole, and has no independent identity or cross-references.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- courses (domain: Course)
-- ----------------------------------------------------------------------------
create table courses (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  type             text not null default '',
  start_date       date,
  end_date         date,
  price            numeric(14,2) not null default 0 check (price >= 0),
  status           text not null
                     check (status in ('פעיל', 'פתוח להרשמה', 'הסתיים', 'מלא')),
  zoom             text not null default '',
  instructor_id    uuid not null references profiles(id),
  is_ai            boolean not null default false,
  blurb            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table courses is 'domain: Course. policies: see 012_rls_policies.sql';

create trigger trg_courses_updated_at
  before update on courses for each row execute function set_updated_at();
alter table courses enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- learning_paths (domain: LearningPath). stages[] (LearningPathStage) as JSONB.
-- ----------------------------------------------------------------------------
create table learning_paths (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  course_id        text not null references courses(id),
  stages           jsonb not null default '[]'::jsonb,  -- LearningPathStage[]
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table learning_paths is
  'domain: LearningPath. stages[] embedded JSONB. policies: see 012_rls_policies.sql';

create trigger trg_learning_paths_updated_at
  before update on learning_paths for each row execute function set_updated_at();
alter table learning_paths enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- students (domain: Student)
-- ----------------------------------------------------------------------------
create table students (
  id               text primary key,
  organization_id  text not null references organizations(id),
  name             text not null,
  phone            text not null default '',
  email            text not null default '',
  -- linked profile (User account) when the student has one; null otherwise.
  user_id          uuid references profiles(id),
  status           entity_status default 'פעיל',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table students is 'domain: Student. policies: see 012_rls_policies.sql';

create trigger trg_students_updated_at
  before update on students for each row execute function set_updated_at();
alter table students enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- enrollments (domain: Enrollment). stages[] (StageProgress) embedded as JSONB.
-- Each StageProgress element mirrors:
--   { stageId, status, due, text, files[], links[], checklistDone[], notes[], help, updated }
-- status values (StageProgressStatus): 'לא התחיל' | 'בעבודה' | 'הוגש לבדיקה' |
--   'ממתין לאישור מדריך' | 'אושר' | 'נדרש תיקון' | 'באיחור' | 'חסום / צריך עזרה'.
-- ----------------------------------------------------------------------------
create table enrollments (
  id               text primary key,
  organization_id  text not null references organizations(id),
  student_id       text not null references students(id),
  student_name     text not null,
  course_id        text not null references courses(id),
  payment          text not null check (payment in ('שולם', 'ממתין')),
  stages           jsonb not null default '[]'::jsonb,  -- StageProgress[]
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table enrollments is
  'domain: Enrollment. stages[] = StageProgress[] embedded JSONB (embedded value object; no own identity). policies: see 012_rls_policies.sql';

create trigger trg_enrollments_updated_at
  before update on enrollments for each row execute function set_updated_at();
alter table enrollments enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- course_sessions (domain: CourseSession). attendance[] embedded as JSONB.
-- ----------------------------------------------------------------------------
create table course_sessions (
  id                text primary key,
  organization_id   text not null references organizations(id),
  course_id         text not null references courses(id),
  title             text not null,
  scheduled_at      timestamptz,
  duration_minutes  integer not null default 0 check (duration_minutes >= 0),
  zoom_url          text not null default '',
  notes             text not null default '',
  -- Wave 6 m007 — structured attendance; [] = not recorded.
  attendance        jsonb not null default '[]'::jsonb,  -- { studentId, present }[]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table course_sessions is
  'domain: CourseSession. attendance[] embedded JSONB. policies: see 012_rls_policies.sql';

create trigger trg_course_sessions_updated_at
  before update on course_sessions for each row execute function set_updated_at();
alter table course_sessions enable row level security;
-- policies: see 012_rls_policies.sql

-- ----------------------------------------------------------------------------
-- assignments (domain: Assignment)
-- ----------------------------------------------------------------------------
create table assignments (
  id               text primary key,
  organization_id  text not null references organizations(id),
  course_id        text not null references courses(id),
  -- stageId: LearningPathStage id within the course path (embedded, no FK target).
  stage_id         text,
  title            text not null,
  description      text not null default '',
  due              date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table assignments is 'domain: Assignment. policies: see 012_rls_policies.sql';

create trigger trg_assignments_updated_at
  before update on assignments for each row execute function set_updated_at();
alter table assignments enable row level security;
-- policies: see 012_rls_policies.sql
