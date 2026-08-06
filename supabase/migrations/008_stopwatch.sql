-- Migration 008 — Stopwatch Game
-- Skill-basiertes Spiel: Die Uhr läuft und zeigt die Zeit auf die Millisekunde genau.
-- Ziel: so nah wie möglich bei target_ms (10,000 s) stoppen.
-- Die Auszahlung ist vollständig backend-/DB-definiert (config.tiers) — der Client
-- meldet nur die gestoppte Zeit, die Punktevergabe berechnet mod-games server-seitig.

insert into public.games (slug, name, type, cost_points, config) values
  (
    'stopwatch',
    'Stoppuhr',
    'builtin',
    40,
    '{
      "target_ms": 10000,
      "tiers": [
        { "max_dev_ms": 0,   "multiplier": 10 },
        { "max_dev_ms": 10,  "multiplier": 5 },
        { "max_dev_ms": 50,  "multiplier": 2 },
        { "max_dev_ms": 150, "multiplier": 1 }
      ]
    }'::jsonb
  )
on conflict (slug) do update
  set name        = excluded.name,
      cost_points = excluded.cost_points,
      config      = excluded.config;
