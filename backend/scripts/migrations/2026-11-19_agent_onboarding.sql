-- Agent onboarding only. Apply manually to an isolated development database first.
-- No existing accounting tables are altered. Never run via synchronize.
CREATE TABLE IF NOT EXISTS agent_onboarding_profiles (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_uid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  scope_key VARCHAR(100) COLLATE utf8mb4_bin NOT NULL COMMENT 'Empty for person, owned business number otherwise',
  preferred_name TEXT NULL, employment TEXT NULL, activity TEXT NULL,
  business_stage TEXT NULL, registration TEXT NULL, workplace TEXT NULL, vehicle TEXT NULL,
  employees TEXT NULL, partners TEXT NULL, international TEXT NULL, current_need TEXT NULL,
  field_states JSON NOT NULL, story MEDIUMTEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  invitation VARCHAR(20) NOT NULL DEFAULT 'new',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY ux_onboarding_owner_scope (owner_uid,scope_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_onboarding_proposals (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_uid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  business_number VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  base_person_version INT UNSIGNED NOT NULL, base_business_version INT UNSIGNED NOT NULL,
  payload JSON NOT NULL, source_text TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), applied_at DATETIME(6) NULL,
  KEY ix_onboarding_proposal_owner (owner_uid,business_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_onboarding_changes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_uid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  business_number VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  source_text TEXT NOT NULL, assistant_text TEXT NOT NULL,
  proposal_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY ux_onboarding_change_proposal (proposal_id),
  KEY ix_onboarding_change_owner (owner_uid,business_number,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_onboarding_facts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  profile_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope_kind VARCHAR(20) NOT NULL, field_key VARCHAR(40) NULL,
  statement TEXT NOT NULL, value_text TEXT NULL, answer_state VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', change_kind VARCHAR(20) NOT NULL,
  replaces_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  effective_date VARCHAR(10) NULL, valid_to_text VARCHAR(10) NULL, date_precision VARCHAR(20) NOT NULL,
  evidence TEXT NOT NULL, source_type VARCHAR(20) NOT NULL DEFAULT 'user', change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_onboarding_fact_profile (profile_id,status),
  CONSTRAINT fk_onboarding_fact_profile FOREIGN KEY (profile_id) REFERENCES agent_onboarding_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_onboarding_story_versions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  profile_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT UNSIGNED NOT NULL, story MEDIUMTEXT NOT NULL,
  change_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY ux_onboarding_story_version (profile_id,version),
  CONSTRAINT fk_onboarding_story_profile FOREIGN KEY (profile_id) REFERENCES agent_onboarding_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
