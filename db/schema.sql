-- Fairway Friends League Platform — core schema
-- PostgreSQL. Deliberately narrow: only what the import path needs.
-- League, season and financial tables are Phase 1/2 and land separately.

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
-- Keyed on udisc_username. NEVER on display_name: two league members can
-- both be "Dad", and merging them would corrupt every stat downstream.
CREATE TABLE IF NOT EXISTS players (
  id                BIGSERIAL PRIMARY KEY,
  udisc_username    TEXT        NOT NULL UNIQUE,
  display_name      TEXT        NOT NULL,
  pdga_number       TEXT,
  profile_photo_url TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- scorecards
-- ---------------------------------------------------------------------------
-- source_round_id is the UDisc permalink id (e.g. mns8y9vb4afhk4v7lafcmk8n).
-- The UNIQUE constraint IS the duplicate protection — importing the same link
-- twice cannot create a second row even if application code fails.
CREATE TABLE IF NOT EXISTS scorecards (
  id                BIGSERIAL PRIMARY KEY,
  source_round_id   TEXT        NOT NULL UNIQUE,
  source_url        TEXT        NOT NULL,
  source_course_url TEXT,
  course_name       TEXT,
  layout            TEXT,
  played_at         TIMESTAMPTZ,
  location          TEXT,
  holes             JSONB       NOT NULL,   -- [{number,distance,par}, ...]
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by       BIGINT REFERENCES players(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS scorecards_played_at_idx   ON scorecards (played_at DESC);
CREATE INDEX IF NOT EXISTS scorecards_course_name_idx ON scorecards (course_name);

-- ---------------------------------------------------------------------------
-- scorecard_players
-- ---------------------------------------------------------------------------
-- The (scorecard_id, player_id) primary key means one player cannot appear
-- twice on the same card — the second half of the "never duplicate players"
-- requirement.
CREATE TABLE IF NOT EXISTS scorecard_players (
  scorecard_id  BIGINT NOT NULL REFERENCES scorecards(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES players(id)    ON DELETE RESTRICT,
  position      INTEGER NOT NULL,
  total_strokes INTEGER NOT NULL,
  to_par        INTEGER,
  strokes       JSONB   NOT NULL,   -- [3,2,2,...] length == scorecards.holes length
  PRIMARY KEY (scorecard_id, player_id)
);

CREATE INDEX IF NOT EXISTS scorecard_players_player_idx ON scorecard_players (player_id);

-- ---------------------------------------------------------------------------
-- Integrity guard
-- ---------------------------------------------------------------------------
-- Belt and braces behind the parser's own assertion: a scorecard whose stroke
-- array length does not match the hole count should be impossible to write,
-- not merely unlikely.

CREATE OR REPLACE FUNCTION assert_strokes_match_holes()
RETURNS TRIGGER AS $$
DECLARE
  hole_count   INTEGER;
  stroke_count INTEGER;
BEGIN
  SELECT jsonb_array_length(holes) INTO hole_count
    FROM scorecards WHERE id = NEW.scorecard_id;

  stroke_count := jsonb_array_length(NEW.strokes);

  IF hole_count IS NULL THEN
    RAISE EXCEPTION 'scorecard % not found', NEW.scorecard_id;
  END IF;

  IF stroke_count <> hole_count THEN
    RAISE EXCEPTION
      'scorecard % has % holes but player row supplies % strokes',
      NEW.scorecard_id, hole_count, stroke_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scorecard_players_stroke_count_guard ON scorecard_players;
CREATE TRIGGER scorecard_players_stroke_count_guard
  BEFORE INSERT OR UPDATE ON scorecard_players
  FOR EACH ROW EXECUTE FUNCTION assert_strokes_match_holes();
