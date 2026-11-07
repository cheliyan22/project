/*
# Expand badge catalog to 50 unique badges

Adds 38 new badges across all rarities covering:
- Activity milestones (ideas submitted, viewed, shared)
- Social actions (votes, comments, collaborations)
- Time-based events (night owl, weekend warrior, streak)
- Special achievements (oracle, pioneer, speedrun)
- Cosmetic/fun badges (all rarities)
*/

INSERT INTO badges (slug, name, description, icon, rarity, xp_reward) VALUES
  -- Milestone: Submission
  ('deep_dive',       'Deep Dive',         'Spent over 10 minutes examining a single idea',           '🤿', 'common',    35),
  ('idea_hoarder',    'Idea Hoarder',      'Bookmarked 10 or more ideas',                             '🗃️','common',    40),
  ('serial_founder',  'Serial Founder',    'Submitted 10 ideas to the archive',                       '🔄', 'rare',     180),
  ('curator_pro',     'Curator Pro',       'An idea you published reached 500 views',                 '🎬', 'epic',     320),
  ('legend',          'Legend',            'Reached 10,000 XP',                                       '🌟', 'legendary',1500),
  ('immortal',        'Immortal',          'Still active after 365 days',                             '♾️', 'legendary',2000),
  ('phoenix',         'Phoenix',           'Revived a project dead for 5+ years',                     '🦅', 'legendary',1200),
  ('speedrunner',     'Speedrunner',       'Submitted and got 10 upvotes within 1 hour',              '⚡', 'epic',     400),
  ('hacker',          'Hacker',            'Used AI Lab 50 times',                                    '💻', 'rare',     160),
  ('codebreaker',     'Codebreaker',       'Found a hidden easter egg in the app',                    '🔐', 'legendary',900),

  -- Social / Community
  ('connector',       'Connector',         'Introduced two builders who then collaborated',           '🔗', 'epic',     280),
  ('advocate',        'Advocate',          'Shared 5 ideas to external platforms',                    '📢', 'common',    55),
  ('mentor',          'Mentor',            'Helped 3 people revive their abandoned ideas',            '🧑‍🏫','epic',    350),
  ('contributor',     'Contributor',       'Left 25 helpful comments on ideas',                      '💬', 'rare',     140),
  ('upvote_king',     'Upvote King',       'Cast 100 upvotes across the archive',                    '👍', 'rare',     120),
  ('influencer',      'Influencer',        'Your profile was visited 1000 times',                    '📡', 'epic',     300),
  ('beloved',         'Beloved',           'Received 50 upvotes on a single comment',                '❤️', 'legendary',700),

  -- Time-based
  ('weekend_warrior', 'Weekend Warrior',   'Active every weekend for a month',                       '⚔️', 'rare',     150),
  ('streak_7',        'On Fire',           '7-day activity streak',                                  '🔥', 'common',    80),
  ('streak_30',       'Unstoppable',       '30-day activity streak',                                 '🌋', 'epic',     450),
  ('early_riser',     'Early Riser',       'Submitted an idea before 6am',                           '🌅', 'common',    45),
  ('lunch_coder',     'Lunch Coder',       'Active between 12pm and 1pm for 5 days',                 '🥪', 'common',    30),
  ('insomniac',       'Insomniac',         'Active at 3am for 3 consecutive nights',                 '🌙', 'rare',     130),

  -- Discovery & Exploration
  ('explorer',        'Explorer',          'Visited every section of the app',                       '🗺️', 'common',    60),
  ('archivist',       'Archivist',         'Read through 100 archived ideas',                        '📜', 'rare',     170),
  ('historian',       'Historian',         'Explored ideas from 5 different decades',               '🏛️', 'epic',     260),
  ('cartographer',    'Cartographer',      'Mapped connections between 10 related ideas',           '🧭', 'rare',     200),
  ('rabbit_hole',     'Rabbit Hole',       'Followed a chain of 8 related ideas in one session',   '🐇', 'epic',     310),

  -- AI Lab
  ('ai_whisperer',    'AI Whisperer',      'Generated 10 AI analyses',                              '🤖', 'rare',     145),
  ('prompt_master',   'Prompt Master',     'Crafted an AI prompt that went viral',                  '✨', 'epic',     380),
  ('neural_net',      'Neural Net',        'Connected AI insights to 5 real revival plans',        '🧠', 'epic',     290),
  ('silicon_dreams',  'Silicon Dreams',    'AI Lab predicted a revival that actually happened',    '🔮', 'legendary',1100),

  -- GitHub
  ('repo_raider',     'Repo Raider',       'Imported 10 GitHub repos into Reboot',                 '🐙', 'rare',     155),
  ('open_source',     'Open Source',       'Revived an open source project',                       '📦', 'rare',     175),
  ('star_gazer',      'Star Gazer',        'Found a repo with 10k+ stars',                         '⭐', 'epic',     270),

  -- Fun / Cosmetic
  ('pixel_art',       'Pixel Art',         'Used only pixel-art cover images',                     '🎮', 'common',    25),
  ('minimalist',      'Minimalist',        'Published an idea with the shortest possible description','➖','common',   20),
  ('maximalist',      'Maximalist',        'Published an idea with 1000+ character description',   '📖', 'common',    35),
  ('palindrome',      'Palindrome',        'Your XP hit a palindrome number',                      '🔢', 'rare',     100),
  ('lucky_7',         'Lucky 7',           'Your rank hit exactly #7',                             '🎰', 'rare',     177),
  ('centennial',      'Centennial',        'Your 100th day on Reboot',                             '💯', 'epic',     420)
ON CONFLICT (slug) DO NOTHING;
