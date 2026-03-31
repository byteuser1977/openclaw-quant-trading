/**
 * Machine Learning Strategy Skeleton
 *
 * Framework template for custom ML models (Random Forest, XGBoost, LightGBM, etc.).
 * Provides hooks for training and prediction.
 * Users must implement model-specific logic (on_train, on_predict).
 *
 * Features:
 * - Automatic feature engineering (technical indicators)
 * - Train/predict lifecycle hooks
 * - Model persistence (save/load)
 * - Probability threshold tuning
 *
 * Best for:Advanced users with custom ML models
 * Risk: Varies. Depends on model quality and data.
 */

import { StrategyTemplate, IndicatorConfig } from '../compiler';
import { ParameterSpaceBuilder, CategoricalParameter, IntParameter, DecimalParameter } from '../parameters';

export interface MlSkeletonParams {
  model_type: 'random_forest' | 'xgboost' | 'lightgbm' | 'custom';
  retrain_interval_days: number;
  train_lookback_days: number;
  prediction_threshold: number; // Probability threshold for entry (0.5-0.9)
  features: string[]; // List of indicators to use as features
  target_periods: number; // How many bars into future to predict
  use_atr_stop?: boolean;
  atr_multiplier?: number;
}

/**
 * Default parameters
 */
export function getDefaultParams(): MlSkeletonParams {
  return {
    model_type: 'xgboost',
    retrain_interval_days: 7,
    train_lookback_days: 365,
    prediction_threshold: 0.6,
    features: [
      'rsi_14',
      'macd',
      'macd_signal',
      'bb_upper_20',
      'bb_lower_20',
      'volume_ratio',
      'returns_1h',
      'returns_4h',
    ],
    target_periods: 12, // Predict 12 bars ahead
    use_atr_stop: true,
    atr_multiplier: 2.0,
  };
}

/**
 * Parameter space for Hyperopt
 */
export function getParameterSpace() {
  return new ParameterSpaceBuilder()
    .addCategorical('model_type', ['random_forest', 'xgboost', 'lightgbm'], 'xgboost', 'ML model type')
    .addInt('retrain_interval_days', 1, 30, 7, 'Retrain interval in days')
    .addInt('train_lookback_days', 30, 730, 365, 'Training data lookback period')
    .addDecimal('prediction_threshold', 0.5, 0.9, 0.6, 0.05, 'Entry probability threshold')
    .addInt('target_periods', 1, 48, 12, 'Prediction horizon (bars)')
    .addBoolean('use_atr_stop', true, 'Use ATR-based stop')
    .addDecimal('atr_multiplier', 1.0, 5.0, 2.0, 0.25, 'ATR multiplier for stop distance')
    .build();
}

/**
 * Create ML Skeleton strategy template
 */
export function createMlSkeletonStrategy(
  name: string = 'ML Skeleton',
  timeframe: string = '1h',
  customParams?: Partial<MlSkeletonParams>
): StrategyTemplate {
  const params = { ...getDefaultParams(), ...customParams };

  // Build feature indicator list
  const indicators: IndicatorConfig[] = [
    // Core indicators for feature set
    {
      name: 'rsi',
      function: 'RSI',
      params: { timeperiod: 14 },
      input: 'close',
      output: 'rsi_14',
    },
    {
      name: 'macd',
      function: 'MACD',
      params: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
      input: 'close',
      output: 'macd_line',
    },
    {
      name: 'bb_upper',
      function: 'BBANDS',
      params: { timeperiod: 20, nbdevup: 2, nbdevdn: 2 },
      input: 'close',
      output: 'bb_upper_20',
    },
    {
      name: 'bb_lower',
      function: 'BBANDS',
      params: { timeperiod: 20, nbdevup: 2, nbdevdn: 2 },
      input: 'close',
      output: 'bb_lower_20',
    },
    // Volume features
    {
      name: 'volume_sma',
      function: 'SMA',
      params: { timeperiod: 20 },
      input: 'volume',
      output: 'volume_sma_20',
    },
    // Returns / momentum
    {
      name: 'returns_1h',
      function: 'CUSTOM', // Custom: price pct change
      params: { periods: 1 },
      input: 'close',
      output: 'returns_1h',
    },
    {
      name: 'returns_4h',
      function: 'CUSTOM',
      params: { periods: 4 },
      input: 'close',
      output: 'returns_4h',
    },
    // ATR for stop loss
    {
      name: 'atr',
      function: 'ATR',
      params: { timeperiod: 14 },
      input: 'close',
      output: 'atr_14',
    },
    // Target variable (will be NaN for future periods)
    {
      name: 'target_future_return',
      function: 'CUSTOM', // Target: future price change
      params: { periods: params.target_periods },
      input: 'close',
      output: 'target_return',
    },
  ];

  return {
    name,
    description: `Machine Learning strategy skeleton using ${params.model_type}. ` +
                 `Trains every ${params.retrain_interval_days} days on ${params.train_lookback_days} days of data. ` +
                 `Entry when prediction > ${params.prediction_threshold}.`,
    className: 'MlSkeletonStrategy',
    timeframe,
    GeminiTags: ['machine-learning', 'predictive', 'advanced'],
    version: '1.0.0',
    author: 'OpenClaw Quant',
    indicators,
    // Entry/exit conditions are determined by model predictions
    entryConditions: [
      // Placeholder - actual logic in custom method
      {
        left: 'ml_signal',
        operator: '>',
        right: params.prediction_threshold,
      },
    ],
    exitConditions: [
      // Exit on opposite signal or stoploss
      {
        left: 'ml_signal',
        operator: '<',
        right: 0.5, // Neutral/negative
        logic: 'OR',
      },
    ],
    parameters: {
      model_type: params.model_type,
      retrain_interval_days: params.retrain_interval_days,
      train_lookback_days: params.train_lookback_days,
      prediction_threshold: params.prediction_threshold,
      target_periods: params.target_periods,
      features: params.features,
      use_atr_stop: params.use_atr_stop,
      atr_multiplier: params.atr_multiplier,
    },
  };
}

