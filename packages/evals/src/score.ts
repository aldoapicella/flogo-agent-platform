export interface EvalMetrics {
  taskSuccessRate: number;
  buildSuccessRate: number;
  smokePassRate: number;
  averageToolCalls: number;
  tokenCost: number;
  regressionDelta: number;
}

export const scoreEvalRun = (metrics: EvalMetrics): number => {
  return Math.round(
    metrics.taskSuccessRate * 40 +
      metrics.buildSuccessRate * 20 +
      metrics.smokePassRate * 20 +
      Math.max(0, 10 - metrics.averageToolCalls) * 1 +
      Math.max(0, 5 - metrics.tokenCost / 10) * 2 +
      Math.max(0, 10 - metrics.regressionDelta) * 1
  );
};
