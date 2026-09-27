PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(provider, subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT,
  department TEXT,
  program TEXT,
  year_level TEXT,
  semester_label TEXT,
  advisor TEXT,
  has_advisor INTEGER NOT NULL DEFAULT 0,
  research_interest TEXT,
  thesis_direction TEXT,
  email TEXT,
  onboarded_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  disclosure TEXT NOT NULL DEFAULT 'starter',
  cat_visible INTEGER NOT NULL DEFAULT 1,
  cat_animation INTEGER NOT NULL DEFAULT 1,
  socratic INTEGER NOT NULL DEFAULT 1,
  privacy_mode INTEGER NOT NULL DEFAULT 1,
  ai_include_sensitive INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'research',
  night INTEGER NOT NULL DEFAULT 0,
  pinned_modules TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semester_id TEXT,
  name TEXT NOT NULL,
  instructor TEXT,
  schedule TEXT,
  weekday INTEGER,
  start_time TEXT,
  end_time TEXT,
  location TEXT,
  credits REAL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_materials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT,
  document_id TEXT,
  due_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  kind TEXT NOT NULL,
  course_id TEXT,
  project_id TEXT,
  paper_id TEXT,
  meeting_id TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'user',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT,
  mime TEXT,
  path TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  version_token TEXT,
  bytes INTEGER,
  text_status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  course_id TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  paper_id TEXT,
  chunk_index INTEGER NOT NULL,
  page INTEGER,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES document_chunks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized TEXT NOT NULL,
  UNIQUE(user_id, normalized)
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT,
  title TEXT NOT NULL,
  year INTEGER,
  journal TEXT,
  doi TEXT,
  url TEXT,
  abstract TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  relevance TEXT,
  relevance_reason TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_authors (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (paper_id, author_id)
);

CREATE TABLE IF NOT EXISTS paper_extractions (
  paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  purpose TEXT,
  questions TEXT,
  theory TEXT,
  method TEXT,
  participants TEXT,
  sample_size TEXT,
  instruments TEXT,
  statistics TEXT,
  findings TEXT,
  limitations TEXT,
  future_work TEXT,
  one_liner TEXT,
  summary_300 TEXT,
  full_summary TEXT,
  method_summary TEXT,
  value_note TEXT,
  confidence TEXT NOT NULL DEFAULT 'unverified',
  raw_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  doi TEXT,
  apa7 TEXT,
  bibtex TEXT,
  ris TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  raw_json TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  stage TEXT NOT NULL DEFAULT '0',
  progress INTEGER NOT NULL DEFAULT 0,
  next_step TEXT,
  gaps TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  keywords TEXT,
  project_id TEXT,
  related_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  course_id TEXT,
  project_id TEXT,
  meeting_id TEXT,
  paper_id TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  source_note_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  kind TEXT NOT NULL DEFAULT 'personal',
  course_id TEXT,
  location TEXT,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'advisor',
  happened_at TEXT NOT NULL,
  participants TEXT,
  body TEXT NOT NULL DEFAULT '',
  decisions TEXT,
  teacher_feedback TEXT,
  project_id TEXT,
  course_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thesis_sections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  todos TEXT,
  ai_note TEXT,
  teacher_feedback TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, stage_key)
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT,
  columns_json TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  preview_json TEXT,
  storage_path TEXT,
  project_id TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'sensitive',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dataset_id TEXT,
  project_id TEXT,
  method TEXT NOT NULL,
  design_note TEXT,
  assumptions TEXT,
  result_json TEXT NOT NULL,
  apa TEXT,
  limitations TEXT,
  ai_interpretation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qual_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  project_id TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'sensitive',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qual_project_id TEXT NOT NULL REFERENCES qual_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'interview',
  body TEXT NOT NULL,
  immutable_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qual_project_id TEXT NOT NULL REFERENCES qual_projects(id) ON DELETE CASCADE,
  transcript_id TEXT,
  excerpt TEXT,
  label TEXT NOT NULL,
  memo TEXT,
  origin TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qual_project_id TEXT NOT NULL REFERENCES qual_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  origin TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, kind, normalized)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  origin TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, from_id, to_id, relation)
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  mode TEXT NOT NULL DEFAULT 'research',
  project_id TEXT,
  course_id TEXT,
  paper_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources_json TEXT,
  sections_json TEXT,
  agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  scope_type TEXT,
  scope_id TEXT,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  source_note_id TEXT,
  origin TEXT NOT NULL DEFAULT 'ai',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  paper_id TEXT,
  project_id TEXT,
  minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reflection TEXT
);

CREATE TABLE IF NOT EXISTS official_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  excerpt TEXT,
  content_hash TEXT,
  fetched_at TEXT NOT NULL,
  changed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS integration_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  scopes TEXT,
  external_email TEXT,
  meta_json TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drive_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  modified_time TEXT,
  folder TEXT,
  document_id TEXT,
  last_indexed_at TEXT,
  UNIQUE(user_id, drive_id)
);

CREATE TABLE IF NOT EXISTS email_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_id TEXT NOT NULL,
  thread_id TEXT,
  from_addr TEXT,
  subject TEXT,
  snippet TEXT,
  category TEXT,
  received_at TEXT,
  UNIQUE(user_id, gmail_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  user_id TEXT,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  body,
  content='search_docs',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS search_docs_ai AFTER INSERT ON search_docs BEGIN
  INSERT INTO search_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS search_docs_ad AFTER DELETE ON search_docs BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS search_docs_au AFTER UPDATE ON search_docs BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO search_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_search_user ON search_docs(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON ai_messages(conversation_id, created_at);
