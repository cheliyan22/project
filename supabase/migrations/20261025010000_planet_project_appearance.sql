-- Additive persistence for a project owner's Reboot Planet appearance.
-- Existing ideas and their contents are preserved.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS building_customization jsonb;

ALTER TABLE public.ideas
  DROP CONSTRAINT IF EXISTS ideas_building_customization_object;

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_building_customization_object
  CHECK (building_customization IS NULL OR jsonb_typeof(building_customization) = 'object');

CREATE OR REPLACE FUNCTION public.customize_project_appearance(idea_id uuid, config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saved jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF config IS NULL OR jsonb_typeof(config) <> 'object' THEN
    RAISE EXCEPTION 'Appearance config must be an object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(config) k(key)
    WHERE k.key NOT IN ('color', 'height', 'style', 'glowIntensity')
  ) THEN
    RAISE EXCEPTION 'Unsupported appearance field';
  END IF;
  IF config ? 'color' AND (
    jsonb_typeof(config->'color') <> 'string'
    OR config->>'color' !~ '^#[0-9A-Fa-f]{6}$'
  ) THEN
    RAISE EXCEPTION 'Color must be a six-digit hex color';
  END IF;
  IF config ? 'height' AND (
    jsonb_typeof(config->'height') <> 'number'
    OR (config->>'height')::numeric < 0.5
    OR (config->>'height')::numeric > 2
  ) THEN
    RAISE EXCEPTION 'Height must be between 0.5 and 2';
  END IF;
  IF config ? 'style' AND (
    jsonb_typeof(config->'style') <> 'string'
    OR config->>'style' NOT IN ('standard', 'spire', 'pyramid', 'dome', 'crystal')
  ) THEN
    RAISE EXCEPTION 'Unsupported rooftop style';
  END IF;
  IF config ? 'glowIntensity' AND (
    jsonb_typeof(config->'glowIntensity') <> 'number'
    OR (config->>'glowIntensity')::numeric < 0.5
    OR (config->>'glowIntensity')::numeric > 4
  ) THEN
    RAISE EXCEPTION 'Glow intensity must be between 0.5 and 4';
  END IF;

  UPDATE public.ideas i
    SET building_customization = config
    WHERE i.id = idea_id AND i.user_id = v_uid
    RETURNING i.building_customization INTO v_saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or not owned by this account';
  END IF;

  RETURN jsonb_build_object('buildingCustomization', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.customize_project_appearance(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customize_project_appearance(uuid, jsonb) TO authenticated;
