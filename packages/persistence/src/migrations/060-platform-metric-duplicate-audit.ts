/** Preserve the number of source rows collapsed before a platform-metric
 * import was written. This keeps browser and API imports equally explainable
 * when a CSV repeats the same platform/chapter/date key. */
export const migration060 = {
  version: 60,
  name: "platform-metric-duplicate-audit",
  sql: `
    ALTER TABLE platform_metric_imports
      ADD COLUMN duplicate_rows INTEGER NOT NULL DEFAULT 0
        CHECK (duplicate_rows >= 0);
  `,
} as const;
