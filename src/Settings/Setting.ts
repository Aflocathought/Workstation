export const DATASCOPE_MAX_POINTS_MIN = 200;
export const DATASCOPE_MAX_POINTS_MAX = 20000;
export const DATASCOPE_MAX_POINTS_DEFAULT = 4000;
export const DATASCOPE_MAX_POINTS_STEP = 200;

export function clampDatascopeMaxPoints(value: number): number {
	if (!Number.isFinite(value)) return DATASCOPE_MAX_POINTS_DEFAULT;

	return Math.min(
		DATASCOPE_MAX_POINTS_MAX,
		Math.max(DATASCOPE_MAX_POINTS_MIN, Math.floor(value))
	);
}
