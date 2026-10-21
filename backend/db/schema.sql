-- ============================================================
-- Tech4Rum — initial PostgreSQL schema
--
-- Run once on an empty database:
--   psql "$DATABASE_URL" -f schema.sql
--
-- The file starts by dropping everything in reverse-dependency order,
-- so re-running it during development is safe (destroys all data).
--
-- Design decisions locked in for this project:
--   - One `posts` table for questions AND discussions (`post_type` enum).
--   - `answers` kept separate (accept flag, questions only).
--   - `comments` covers question comments, answer comments, and
--      threaded discussion replies (exactly one of post_id / answer_id).
--   - One polymorphic `votes`, `reports`, `post_marks` — each with
--      target_type + target_id.
--   - Soft delete via `deleted_at` on posts, answers, comments.
--   - Reputation cached on `users.reputation` (counter, not event log).
--   - Full-text search via `tsvector` + GIN (title=body+tags).
--   - Only `follows` is persisted; bookmarks and tag-watches are out
--      of scope for this iteration.
--   - No avatar storage — the client derives a character avatar from
--      the username / display_name.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Drop in reverse-dependency order ----------
DROP TABLE IF EXISTS follows      CASCADE;
DROP TABLE IF EXISTS post_marks   CASCADE;
DROP TABLE IF EXISTS reports      CASCADE;
DROP TABLE IF EXISTS votes        CASCADE;
DROP TABLE IF EXISTS post_tags    CASCADE;
DROP TABLE IF EXISTS comments     CASCADE;
DROP TABLE IF EXISTS answers      CASCADE;
DROP TABLE IF EXISTS posts        CASCADE;
DROP TABLE IF EXISTS tags         CASCADE;
DROP TABLE IF EXISTS users        CASCADE;

DROP TYPE IF EXISTS post_type      CASCADE;
DROP TYPE IF EXISTS user_role      CASCADE;
DROP TYPE IF EXISTS user_status    CASCADE;
DROP TYPE IF EXISTS report_status  CASCADE;
DROP TYPE IF EXISTS mark_type      CASCADE;
DROP TYPE IF EXISTS vote_target    CASCADE;
DROP TYPE IF EXISTS report_target  CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS posts_compute_search_vector() CASCADE;
DROP FUNCTION IF EXISTS post_tags_refresh_search_vector() CASCADE;
DROP FUNCTION IF EXISTS answers_maintain_post_stats() CASCADE;
DROP FUNCTION IF EXISTS comments_maintain_post_stats() CASCADE;
DROP FUNCTION IF EXISTS votes_maintain_target_score() CASCADE;
DROP FUNCTION IF EXISTS posts_validate_accepted_answer() CASCADE;

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE post_type     AS ENUM ('question', 'discussion');
CREATE TYPE user_role     AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'dismissed');
CREATE TYPE mark_type     AS ENUM ('duplicated', 'violated', 'off_topic', 'spam');

-- Target enums for polymorphic tables.
-- Questions and discussions are BOTH `post` — the app derives
-- question-vs-discussion from posts.post_type on read.
CREATE TYPE vote_target   AS ENUM ('post', 'answer', 'comment');
CREATE TYPE report_target AS ENUM ('post', 'answer', 'comment');

-- ============================================================
-- users
-- ============================================================

CREATE TABLE users (
    id               BIGSERIAL    PRIMARY KEY,
    email            CITEXT       NOT NULL UNIQUE,
    password_hash    TEXT         NOT NULL,
    username         CITEXT       NOT NULL UNIQUE,
    display_name     TEXT         NOT NULL,
    bio              TEXT         NOT NULL DEFAULT '',
    website          TEXT         NOT NULL DEFAULT '',
    location         TEXT         NOT NULL DEFAULT '',
    reputation       INTEGER      NOT NULL DEFAULT 0,
    role             user_role    NOT NULL DEFAULT 'user',
    status           user_status  NOT NULL DEFAULT 'active',
    suspended_until  TIMESTAMPTZ  NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT users_username_format CHECK (
        username ~ '^[A-Za-z0-9_-]{3,30}$'
    ),
    CONSTRAINT users_display_name_length CHECK (
        char_length(display_name) BETWEEN 2 AND 80
    )
);

CREATE INDEX users_reputation_idx ON users (reputation DESC);
CREATE INDEX users_created_at_idx ON users (created_at DESC);

-- ============================================================
-- tags  (used only for filtering)
-- ============================================================

CREATE TABLE tags (
    id           BIGSERIAL    PRIMARY KEY,
    name         CITEXT       NOT NULL UNIQUE,
    description  TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT tags_name_format CHECK (
        name ~ '^[a-z0-9][a-z0-9+.#-]*$'
    ),
    CONSTRAINT tags_name_length CHECK (
        char_length(name) BETWEEN 1 AND 35
    )
);

-- ============================================================
-- posts  (questions + discussions)
-- ============================================================

CREATE TABLE posts (
    id                  BIGSERIAL    PRIMARY KEY,
    post_type           post_type    NOT NULL,
    title               TEXT         NOT NULL,
    body                TEXT         NOT NULL,
    author_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Cached counters (kept in sync by triggers below)
    view_count          INTEGER      NOT NULL DEFAULT 0,
    score               INTEGER      NOT NULL DEFAULT 0,
    answer_count        INTEGER      NOT NULL DEFAULT 0,
    reply_count         INTEGER      NOT NULL DEFAULT 0,

    accepted_answer_id  BIGINT       NULL,       -- FK added after answers
    is_locked           BOOLEAN      NOT NULL DEFAULT FALSE,
    search_vector       TSVECTOR     NULL,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  NULL,

    CONSTRAINT posts_title_length CHECK (
        char_length(title) BETWEEN 5 AND 150
    ),
    CONSTRAINT posts_body_length CHECK (
        (post_type = 'question'   AND char_length(body) >= 20) OR
        (post_type = 'discussion' AND char_length(body) >= 10)
    ),
    CONSTRAINT posts_only_question_can_accept CHECK (
        post_type = 'question' OR accepted_answer_id IS NULL
    ),
    -- Composite uniqueness so `answers` can FK to (id, post_type) and
    -- thereby guarantee answers only attach to questions.
    CONSTRAINT posts_unique_id_type UNIQUE (id, post_type)
);

CREATE INDEX posts_created_at_idx  ON posts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_type_created_idx ON posts (post_type, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_author_idx      ON posts (author_id) WHERE deleted_at IS NULL;
CREATE INDEX posts_score_idx       ON posts (score DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_search_idx      ON posts USING GIN (search_vector);

-- ============================================================
-- answers
-- ============================================================

CREATE TABLE answers (
    id            BIGSERIAL    PRIMARY KEY,
    post_id       BIGINT       NOT NULL,
    post_type     post_type    NOT NULL DEFAULT 'question',
    author_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT         NOT NULL,
    is_accepted   BOOLEAN      NOT NULL DEFAULT FALSE,
    score         INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ  NULL,

    CONSTRAINT answers_body_length CHECK (char_length(body) >= 5),
    CONSTRAINT answers_only_on_questions CHECK (post_type = 'question'),
    CONSTRAINT answers_post_fk FOREIGN KEY (post_id, post_type)
        REFERENCES posts(id, post_type) ON DELETE CASCADE
);

CREATE INDEX answers_post_idx       ON answers (post_id) WHERE deleted_at IS NULL;
CREATE INDEX answers_author_idx     ON answers (author_id) WHERE deleted_at IS NULL;
CREATE INDEX answers_post_score_idx ON answers (post_id, score DESC) WHERE deleted_at IS NULL;

-- Enforce at most one accepted answer per question.
CREATE UNIQUE INDEX answers_one_accepted_per_post
    ON answers (post_id)
    WHERE is_accepted = TRUE AND deleted_at IS NULL;

-- Close the FK cycle (posts.accepted_answer_id → answers.id).
ALTER TABLE posts
    ADD CONSTRAINT posts_accepted_answer_fk
    FOREIGN KEY (accepted_answer_id) REFERENCES answers(id) ON DELETE SET NULL;

-- ============================================================
-- comments
--   - Question comment:  post_id set,  answer_id null, parent null
--   - Answer comment:    post_id null, answer_id set,  parent null
--   - Discussion reply:  post_id set,  answer_id null, parent optional
-- ============================================================

CREATE TABLE comments (
    id                 BIGSERIAL    PRIMARY KEY,
    post_id            BIGINT       NULL REFERENCES posts(id)   ON DELETE CASCADE,
    answer_id          BIGINT       NULL REFERENCES answers(id) ON DELETE CASCADE,
    parent_comment_id  BIGINT       NULL REFERENCES comments(id) ON DELETE CASCADE,
    author_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body               TEXT         NOT NULL,
    score              INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ  NULL,

    CONSTRAINT comments_body_length CHECK (char_length(body) BETWEEN 1 AND 800),
    CONSTRAINT comments_one_parent CHECK (
        (post_id IS NOT NULL)::int + (answer_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX comments_post_idx   ON comments (post_id)   WHERE deleted_at IS NULL;
CREATE INDEX comments_answer_idx ON comments (answer_id) WHERE deleted_at IS NULL;
CREATE INDEX comments_parent_idx ON comments (parent_comment_id) WHERE deleted_at IS NULL;
CREATE INDEX comments_author_idx ON comments (author_id) WHERE deleted_at IS NULL;

-- ============================================================
-- post_tags  (many-to-many)
-- ============================================================

CREATE TABLE post_tags (
    post_id  BIGINT  NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id   BIGINT  NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX post_tags_tag_idx ON post_tags (tag_id, post_id);

-- ============================================================
-- votes  (polymorphic: posts, answers, comments)
--   FK is app-enforced (cannot express in SQL over 3 tables).
-- ============================================================

CREATE TABLE votes (
    id           BIGSERIAL     PRIMARY KEY,
    user_id      BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type  vote_target   NOT NULL,
    target_id    BIGINT        NOT NULL,
    value        SMALLINT      NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT votes_value_check    CHECK (value IN (-1, 1)),
    CONSTRAINT votes_unique_per_user UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX votes_target_idx ON votes (target_type, target_id);

-- ============================================================
-- reports  (polymorphic)
-- ============================================================

CREATE TABLE reports (
    id                   BIGSERIAL      PRIMARY KEY,
    reporter_id          BIGINT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type          report_target  NOT NULL,
    target_id            BIGINT         NOT NULL,
    reason               TEXT           NOT NULL,
    details              TEXT           NOT NULL DEFAULT '',
    status               report_status  NOT NULL DEFAULT 'pending',
    resolved_at          TIMESTAMPTZ    NULL,
    resolved_by_user_id  BIGINT         NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT reports_reason_check CHECK (
        reason IN ('spam', 'abuse', 'off-topic', 'off-topic-discussion',
                   'duplicate', 'plagiarism', 'other')
    ),
    CONSTRAINT reports_details_length CHECK (char_length(details) <= 500),
    CONSTRAINT reports_unique_per_user UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);

-- ============================================================
-- post_marks  (posts only)
-- ============================================================

CREATE TABLE post_marks (
    id                 BIGSERIAL    PRIMARY KEY,
    post_id            BIGINT       NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    mark_type          mark_type    NOT NULL,
    marked_by_user_id  BIGINT       NULL REFERENCES users(id) ON DELETE SET NULL,
    notes              TEXT         NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT post_marks_unique UNIQUE (post_id, mark_type)
);

CREATE INDEX post_marks_post_idx   ON post_marks (post_id);
CREATE INDEX post_marks_type_idx   ON post_marks (mark_type, created_at DESC);
CREATE INDEX post_marks_marker_idx ON post_marks (marked_by_user_id);

-- ============================================================
-- follows  (user → user)
-- ============================================================

CREATE TABLE follows (
    follower_id  BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id  BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT follows_no_self CHECK (follower_id <> followed_id)
);

CREATE INDEX follows_followed_idx ON follows (followed_id);

-- ============================================================
-- Trigger: updated_at
--   Only fires on content changes, not on cached-counter updates.
-- ============================================================

CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_bu
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER posts_updated_at_bu
    BEFORE UPDATE OF title, body ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER answers_updated_at_bu
    BEFORE UPDATE OF body ON answers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER comments_updated_at_bu
    BEFORE UPDATE OF body ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Trigger: posts.search_vector
--   Composed from title (A), tags (B), body (C).
--   Two triggers: one on posts (title/body), one on post_tags.
--   The post_tags trigger updates search_vector directly, which does
--   NOT re-fire the posts trigger because the posts trigger is scoped
--   to `UPDATE OF title, body`.
-- ============================================================

CREATE FUNCTION posts_compute_search_vector() RETURNS TRIGGER AS $$
DECLARE
    tags_text TEXT;
BEGIN
    SELECT COALESCE(string_agg(t.name::text, ' '), '')
    INTO tags_text
    FROM post_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = NEW.id;

    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.body,  '')), 'C') ||
        setweight(to_tsvector('english', tags_text),                'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_search_vector_biu
    BEFORE INSERT OR UPDATE OF title, body ON posts
    FOR EACH ROW EXECUTE FUNCTION posts_compute_search_vector();

CREATE FUNCTION post_tags_refresh_search_vector() RETURNS TRIGGER AS $$
DECLARE
    pid BIGINT;
    tags_text TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN pid := NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN pid := OLD.post_id;
    ELSE RETURN NULL;
    END IF;

    SELECT COALESCE(string_agg(t.name::text, ' '), '')
    INTO tags_text
    FROM post_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = pid;

    UPDATE posts SET search_vector =
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(body,  '')), 'C') ||
        setweight(to_tsvector('english', tags_text),           'B')
    WHERE id = pid;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_tags_search_vector_aiud
    AFTER INSERT OR DELETE ON post_tags
    FOR EACH ROW EXECUTE FUNCTION post_tags_refresh_search_vector();

-- ============================================================
-- Triggers: cached counters
--   - answers_maintain_post_stats  → posts.answer_count
--   - comments_maintain_post_stats → posts.reply_count (discussions only)
--   - votes_maintain_target_score  → posts.score / answers.score / comments.score
--
-- All three handle INSERT / DELETE and soft-delete (UPDATE of deleted_at)
-- correctly, and never double-count when a soft-deleted row is finally
-- hard-deleted.
-- ============================================================

CREATE FUNCTION answers_maintain_post_stats() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET answer_count = answer_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.deleted_at IS NULL THEN
            UPDATE posts SET answer_count = answer_count - 1 WHERE id = OLD.post_id;
        END IF;
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        IF NEW.deleted_at IS NULL THEN
            UPDATE posts SET answer_count = answer_count + 1 WHERE id = NEW.post_id;
        ELSE
            UPDATE posts SET answer_count = answer_count - 1 WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answers_maintain_post_stats_aiud
    AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON answers
    FOR EACH ROW EXECUTE FUNCTION answers_maintain_post_stats();

CREATE FUNCTION comments_maintain_post_stats() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.post_id IS NOT NULL THEN
        UPDATE posts SET reply_count = reply_count + 1
        WHERE id = NEW.post_id AND post_type = 'discussion';
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' AND OLD.post_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE posts SET reply_count = reply_count - 1
        WHERE id = OLD.post_id AND post_type = 'discussion';
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' AND NEW.post_id IS NOT NULL
          AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        IF NEW.deleted_at IS NULL THEN
            UPDATE posts SET reply_count = reply_count + 1
            WHERE id = NEW.post_id AND post_type = 'discussion';
        ELSE
            UPDATE posts SET reply_count = reply_count - 1
            WHERE id = NEW.post_id AND post_type = 'discussion';
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_maintain_post_stats_aiud
    AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON comments
    FOR EACH ROW EXECUTE FUNCTION comments_maintain_post_stats();

CREATE FUNCTION votes_maintain_target_score() RETURNS TRIGGER AS $$
DECLARE
    delta  INTEGER;
    tid    BIGINT;
    ttype  vote_target;
BEGIN
    IF TG_OP = 'INSERT' THEN
        delta := NEW.value;   tid := NEW.target_id;   ttype := NEW.target_type;

    ELSIF TG_OP = 'DELETE' THEN
        delta := -OLD.value;  tid := OLD.target_id;   ttype := OLD.target_type;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle retargeting (rare, but keep it correct)
        IF NEW.target_type <> OLD.target_type OR NEW.target_id <> OLD.target_id THEN
            IF OLD.target_type = 'post'    THEN UPDATE posts    SET score = score - OLD.value WHERE id = OLD.target_id;
            ELSIF OLD.target_type = 'answer' THEN UPDATE answers SET score = score - OLD.value WHERE id = OLD.target_id;
            ELSE                                  UPDATE comments SET score = score - OLD.value WHERE id = OLD.target_id;
            END IF;

            IF NEW.target_type = 'post'    THEN UPDATE posts    SET score = score + NEW.value WHERE id = NEW.target_id;
            ELSIF NEW.target_type = 'answer' THEN UPDATE answers SET score = score + NEW.value WHERE id = NEW.target_id;
            ELSE                                  UPDATE comments SET score = score + NEW.value WHERE id = NEW.target_id;
            END IF;
            RETURN NEW;
        END IF;
        delta := NEW.value - OLD.value;
        tid   := NEW.target_id;
        ttype := NEW.target_type;
    END IF;

    IF    ttype = 'post'    THEN UPDATE posts    SET score = score + delta WHERE id = tid;
    ELSIF ttype = 'answer' THEN UPDATE answers  SET score = score + delta WHERE id = tid;
    ELSIF ttype = 'comment' THEN UPDATE comments SET score = score + delta WHERE id = tid;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER votes_maintain_target_score_aiud
    AFTER INSERT OR UPDATE OR DELETE ON votes
    FOR EACH ROW EXECUTE FUNCTION votes_maintain_target_score();

-- ============================================================
-- Trigger: posts.accepted_answer_id must belong to this post
-- ============================================================

CREATE FUNCTION posts_validate_accepted_answer() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.accepted_answer_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM answers
            WHERE id = NEW.accepted_answer_id AND post_id = NEW.id
        ) THEN
            RAISE EXCEPTION
                'accepted_answer_id=% does not belong to post id=%',
                NEW.accepted_answer_id, NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_validate_accepted_answer_biu
    BEFORE INSERT OR UPDATE OF accepted_answer_id ON posts
    FOR EACH ROW EXECUTE FUNCTION posts_validate_accepted_answer();

COMMIT;