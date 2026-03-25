# Error Handling & Retry Mechanism Design

## 1. Introduction

This document defines a comprehensive error handling strategy for the Freqtrade Skills system. The system must handle failures gracefully across distributed components (exchange APIs, databases, file systems, and external services) while maintaining data integrity and user trust.

---

## 2. Error Classification Taxonomy

### 2.1 Classification Dimensions

| Dimension | Values | Description |
|-----------|--------|-------------|
| **Severity** | `CRITICAL`, `ERROR`, `WARNING`, `INFO` | Impact on system and operations |
| **Scope** | `LOCAL`, `DEPENDENT`, `SYSTEMIC` | Whether it affects other operations |
| **Recoverability** | `AUTOMATIC`, `MANUAL`, `PERMANENT` | How it can be resolved |
| **Origin** | `EXTERNAL`, `INTERNAL`, `USER` | Source of the error |

### 2.2 Error Domain Codes

Error codes are 4-digit strings grouped by domain:

- `1xxx` - Validation & Input Errors
- `2xxx` - Data Access & Storage Errors
- `3xxx` - Strategy & Computation Errors
- `4xxx` - Hyperopt & Optimization Errors
- `5xxx` - Risk Management Errors
- `6xxx` - Exchange API Errors
- `7xxx` - Database Persistence Errors
- `8xxx` - Reporting & Visualization Errors
- `9xxx` - System & Infrastructure Errors

### 2.3 Detailed Error Catalog

#### 1xxx - Validation Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 1001 | `ERR_VALIDATION_SCHEMA` | Input fails JSON schema validation | No | Fix input data |
| 1002 | `ERR_VALIDATION_RANGE` | Numeric value out of allowed range | No | Adjust parameters |
| 1003 | `ERR_VALIDATION_ENUM` | Value not in allowed enumeration | No | Choose valid option |
| 1004 | `ERR_VALIDATION_MISSING` | Required field missing | No | Complete required fields |
| 1005 | `ERR_VALIDATION_TYPE` | Wrong data type (e.g., string instead of number) | No | Correct type |

#### 2xxx - Data Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 2001 | `ERR_DATA_NOT_FOUND` | Requested data file/pair does not exist | No (unless periodic refresh) | Download data first |
| 2002 | `ERR_DATA_CORRUPTED` | Data file damaged or incomplete | Yes (re-download) | Trigger re-download |
| 2003 | `ERR_DATA_MISSING_VALUES` | Data contains NaN or gaps | No | Run data validation & repair |
| 2004 | `ERR_DATA_TIME_GAP` | Missing candles in time series | Yes (gap-fill attempt) | Check exchange or interpolate |
| 2005 | `ERR_DATA_FORMAT` | Unexpected data format (CSV vs HDF5) | No | Convert format |

#### 3xxx - Strategy Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 3001 | `ERR_STRATEGY_NOT_FOUND` | Strategy ID does not exist | No | Check strategy list |
| 3002 | `ERR_STRATEGY_COMPILE` | Python syntax or import error | Yes (after fix) | Fix strategy code |
| 3003 | `ERR_STRATEGY_VALIDATION` | Strategy logic invalid (e.g., condition missing) | No | Review strategy design |
| 3004 | `ERR_INDICATOR_NOT_FOUND` | Referenced indicator/function missing | No | Check TA-Lib installation |
| 3005 | `ERR_STRATEGY_TIMEOUT` | Strategy execution exceeded timeout | Yes (with smaller dataset) | Reduce date range |

#### 4xxx - Hyperopt Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 4001 | `ERR_HYPEROPT_SPACE_EMPTY` | No parameters defined for optimization | No | Define parameter space |
| 4002 | `ERR_HYPEROPT_INVALID_SPACE` | Parameter space definition invalid | No | Fix parameter schema |
| 4003 | `ERR_HYPEROPT_NO_IMPROVEMENT` | Optimization exhausted without improvement | No (but continue) | Review space definition |
| 4004 | `ERR_HYPEROPT_OBJECTIVE_FAIL` | Objective function threw exception | Yes (retry epoch) | Check strategy logic |
| 4005 | `ERR_HYPEROPT_PRUNE_AGGRESSIVE` | Pruner stopped all trials | Yes (adjust pruner) | Reduce pruner aggressiveness |

#### 5xxx - Risk Management Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 5001 | `ERR_RISK_INSUFFICIENT_BALANCE` | Balance too low for position sizing | Yes (after deposit) | Add funds |
| 5002 | `ERR_RISK_INVALID_PARAMS` | Risk parameters violate constraints | No | Adjust risk parameters |
| 5003 | `ERR_RISK_POSITION_TOO_SMALL` | Calculated position below exchange minimum | No (use min) | Increase balance or risk |
| 5004 | `ERR_RISK_EXPOSURE_LIMIT` | Portfolio exposure exceeds limit | Yes (after other positions close) | Wait for reduction |
| 5005 | `ERR_RISK_CIRCUIT_TRIGGERED` | Circuit breaker activated | No (manual reset) | Inspect trades, wait cooldown |

#### 6xxx - Exchange API Errors

| Code | Symbolic Name | Description | Retryable | Backoff |
|------|---------------|-------------|-----------|---------|
| 6001 | `ERR_EXCHANGE_CONNECTION` | Network error (timeout, DNS) | Yes | Exponential, 1s → 2s → 4s → 8s (max 3 retries) |
| 6002 | `ERR_EXCHANGE_AUTH` | API key/secret invalid | No | Fix credentials |
| 6003 | `ERR_EXCHANGE_RATE_LIMIT` | Too many requests (429) | Yes | Wait `reset` time from header |
| 6004 | `ERR_EXCHANGE_BAN` | IP banned or account restricted | No | Contact exchange support |
| 6005 | `ERR_EXCHANGE_MAINTENANCE` | Exchange down for maintenance | Yes (long) | Wait 15-60 min before retry |
| 6006 | `ERR_EXCHANGE_INSUFFICIENT` | Insufficient balance or locked | Yes (if temporary) | Wait for settlement or free balance |
| 6007 | `ERR_EXCHANGE_ORDER_REJECTED` | Order invalid (price, amount, precision) | No | Fix order parameters |
| 6008 | `ERR_EXCHANGE_UNKNOWN` | Unknown error from exchange | Yes (cautious) | Retry once, then fallback |

#### 7xxx - Persistence Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 7001 | `ERR_DB_CONNECTION` | Cannot connect to database | Yes (3 retries) | Check network, credentials |
| 7002 | `ERR_DB_LOCKED` | Database locked (SQLite) | Yes (backoff) | Retry after 100ms |
| 7003 | `ERR_DB_INTEGRITY` | Constraint violation (duplicate key) | No | Fix data or use upsert |
| 7004 | `ERR_DB_DISK_FULL` | No space left on device | No | Free disk space |
| 7005 | `ERR_DB_CORRUPTED` | Database file corrupted | No (restore from backup) | Restore backup |

#### 8xxx - Reporting Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 8001 | `ERR_REPORT_NO_DATA` | No backtest results to report | No | Run backtest first |
| 8002 | `ERR_REPORT_PLOT_FAIL` | Matplotlib/Plotly rendering error | Yes | Retry with simpler plot |
| 8003 | `ERR_REPORT_EXPORT` | Cannot write output file | Yes (if temp issue) | Check disk space, permissions |

#### 9xxx - System Errors

| Code | Symbolic Name | Description | Retryable | Action |
|------|---------------|-------------|-----------|--------|
| 9001 | `ERR_SYS_MEMORY` | Out of memory | No (reduce load) | Use smaller dataset, add swap |
| 9002 | `ERR_SYS_THREAD_EXHAUST` | Thread pool exhausted | Yes (when available) | Increase workers or reduce concurrency |
| 9003 | `ERR_SYS_DISK_FULL` | No disk space for operations | No | Cleanup temp files, add storage |
| 9004 | `ERR_SYS_PERMISSION` | File permission denied | No | Fix file permissions |
| 9005 | `ERR_SYS_TIMEOUT` | Operation timed out (internal) | Yes (with reduced load) | Reduce batch size |

---

## 3. Retry Strategy

### 3.1 Retry Decision Matrix

| Error Domain | Retryable Codes | Max Retries | Backoff Strategy | Conditions |
|--------------|-----------------|-------------|------------------|------------|
| Validation (1xxx) | None | 0 | N/A | Fix input, never retry |
| Data (2xxx) | 2001 (if refresh), 2002, 2004 | 3 | Exponential (1s, 2s, 4s) | Only for transient errors |
| Strategy (3xxx) | 3005 | 2 | Linear (5s, 10s) | With smaller dataset |
| Hyperopt (4xxx) | 4004, 4005 | 3 | Exponential (2s, 4s, 8s) | Reset trial state |
| Risk (5xxx) | 5001 (balance change) | 0 | N/A | Wait for external event |
| Exchange (6xxx) | All except 6002, 6004, 6007 | 5 | Exponential + jitter for network; Fixed wait for rate limit | Respect `Retry-After` header |
| Persistence (7xxx) | 7001, 7002 | 3 | Exponential (100ms, 200ms, 400ms) | Database might come back |
| Reporting (8xxx) | 8002, 8003 | 2 | Linear (2s, 5s) | Fallback to simpler format |
| System (9xxx) | 9002 | 3 | Linear (1s, 5s, 10s) | Wait for resources |

### 3.2 Retry Implementation Pattern

```python
import time
from functools import wraps
from typing import Callable, Any, Optional

def retryable(
    max_retries: int = 3,
    backoff_factor: float = 1.0,
    retryable_codes: Optional[list] = None,
    on_retry: Optional[Callable] = None
):
    """
    Decorator for retryable functions.

    Args:
        max_retries: Maximum number of retry attempts
        backoff_factor: Multiplier for exponential backoff (e.g., 2.0 doubles each retry)
        retryable_codes: List of error codes that trigger retry
        on_retry: Callback invoked before each retry (retry_count, exception)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except SkillError as e:
                    last_exception = e

                    # Check if error is retryable
                    if e.code not in (retryable_codes or []):
                        raise

                    if attempt == max_retries:
                        logger.error(f"Max retries ({max_retries}) exceeded for {func.__name__}")
                        raise

                    # Calculate backoff
                    if e.code in ['6003', '6005']:  # Rate limit or maintenance
                        wait_time = get_retry_after(e) or (backoff_factor * 2 ** attempt)
                    else:
                        wait_time = backoff_factor * (2 ** attempt) + random.uniform(0, 0.1 * wait_time)

                    logger.warning(f"Retryable error {e.code} in {func.__name__}, attempt {attempt+1}/{max_retries}, waiting {wait_time:.2f}s")

                    if on_retry:
                        on_retry(attempt, e)

                    time.sleep(wait_time)

            raise last_exception
        return wrapper
    return decorator

# Usage
@retryable(
    max_retries=3,
    backoff_factor=2.0,
    retryable_codes=['6001', '6003', '6005', '7001', '7002']
)
def fetch_ohlcv(exchange_id: str, pair: str, timeframe: str):
    return exchange_adapter.fetch_ohlcv(exchange_id, pair, timeframe)
```

### 3.3 Circuit Breaker Pattern

For operations that repeatedly fail, use circuit breaker to prevent cascading failures:

```python
from datetime import datetime, timedelta

class CircuitBreaker:
    """
    Circuit breaker tripped after consecutive failures.
    States: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing)
    """

    def __init__(self, failure_threshold=5, recovery_timeout=60, expected_exception=Exception):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception

        self.state = 'CLOSED'
        self.failure_count = 0
        self.last_failure_time = None
        self.success_count = 0  # For half-open state

    def __call__(self, func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if self.state == 'OPEN':
                if datetime.now() - self.last_failure_time > timedelta(seconds=self.recovery_timeout):
                    self.state = 'HALF_OPEN'
                    logger.info("Circuit breaker entering HALF_OPEN state")
                else:
                    raise CircuitBreakerOpenError(f"Circuit breaker OPEN for {self.recovery_timeout}s")

            try:
                result = func(*args, **kwargs)
            except self.expected_exception as e:
                self.failure_count += 1
                self.last_failure_time = datetime.now()

                if self.failure_count >= self.failure_threshold:
                    self.state = 'OPEN'
                    logger.error(f"Circuit breaker OPENED after {self.failure_count} failures")

                raise

            else:
                # Success path
                if self.state == 'HALF_OPEN':
                    self.success_count += 1
                    if self.success_count >= self.failure_threshold:
                        self.state = 'CLOSED'
                        self.failure_count = 0
                        self.success_count = 0
                        logger.info("Circuit breaker CLOSED after successful trials")

                return result

        return wrapper

# Usage
@circuit_breaker(failure_threshold=5, recovery_timeout=300)
def exchange_api_call(...):
    ...
```

---

## 4. Fallback Strategies

### 4.1 Fallback Decision Tree

When an operation fails after all retries, the system should attempt fallback in order:

1. **Graceful Degradation** - Provide partial functionality
2. **Alternative Data Source** - Switch to backup provider
3. **Cache Fallback** - Use stale cached data with warning
4. **User Notification** - Inform user of manual intervention needed

### 4.2 Fallback Implementation

#### 4.2.1 Data Provider Fallback

```python
class MultiSourceDataProvider:
    def __init__(self, primary_exchange, backup_exchanges=[]):
        self.sources = [primary_exchange] + backup_exchanges
        self.source_index = 0

    def fetch_data(self, pair, timeframe, start_date, end_date):
        for i in range(self.source_index, len(self.sources)):
            source = self.sources[i]
            try:
                data = source.download(pair, timeframe, start_date, end_date)
                self.source_index = (i + 1) % len(self.sources)  # Round-robin next time
                return data
            except ExchangeError as e:
                if e.code in ['6005', '6004']:  # Insufficient or banned
                    continue
                raise

        raise AllSourcesFailedError("All data sources failed")
```

#### 4.2.2 Cache Fallback

```python
def get_backtest_results_with_fallback(backtest_id):
    try:
        # Try live computation
        return run_backtest_computation(backtest_id)
    except (TimeoutError, MemoryError, DataCorruptionError):
        logger.warning(f"Live backtest failed for {backtest_id}, trying cache")
        try:
            # Return cached results if available
            cached = get_cached_results(backtest_id)
            if cached and is_fresh(cached, max_age_hours=24):
                return cached
            else:
                raise StaleCacheError("Cache too old")
        except Exception:
            raise BacktestFailedError("Both live computation and cache failed")
```

#### 4.2.3 Simplified Report Generation

```python
def generate_report_with_fallback(backtest_id, template='full'):
    try:
        return generate_full_report(backtest_id, template)
    except PlottingError as e:
        logger.warning(f"Full report plotting failed: {e}, falling back to minimal")
        # Generate minimal report without plots
        return generate_minimal_report(backtest_id)
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        # Just return metrics as JSON
        return {
            'metrics': get_performance_metrics(backtest_id),
            'warning': 'Full report unavailable, showing metrics only'
        }
```

---

## 5. Error Logging and Monitoring

### 5.1 Logging Structure

```python
import logging
import json
from datetime import datetime

logger = logging.getLogger('freqtrade_skills')

class StructuredErrorLogger:
    @staticmethod
    def log_error(
        error_code: str,
        message: str,
        exc_info=None,
        **context
    ):
        """
        Log error in structured JSON format for aggregation.
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'error_code': error_code,
            'severity': ErrorCatalog.get_severity(error_code),
            'message': message,
            'context': context,
            'stack_trace': str(exc_info) if exc_info else None
        }

        logger.error(json.dumps(log_entry))

        # Send to monitoring if critical
        if ErrorCatalog.is_critical(error_code):
            send_to_monitoring_system(log_entry)
```

### 5.2 Metrics Collection

Key metrics to track:

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `errors_total` | Counter | Total errors by code | Spike detection |
| `errors_by_skill` | Counter | Errors per skill module | > 100/hr |
| `retry_success_rate` | Gauge | % of retries that succeeded | < 80% |
| `circuit_breaker_trips` | Counter | Number of CB activations | Any trip |
| `fallback_usage` | Counter | Times fallback was used | > 10% of ops |
| `error_resolution_time` | Histogram | Time from error to resolution | P95 > 1h |
| `strategy_failure_rate` | Gauge | % of strategies failing validation | > 5% |

---

## 6. User-Facing Error Messages

### 6.1 Message Template

```
[ERROR CODE: 6007] Order Rejected

Your order was rejected by the exchange. Possible reasons:
- Insufficient balance (available: 123.45 USDT, required: 200.00 USDT)
- Amount below minimum (minimum: 0.001 BTC)
- Price precision violation

Check your account balance and order parameters, then retry.

Action Items:
1. Verify balance in your exchange account
2. Check minimum order size for this trading pair
3. Ensure price/amount precision matches exchange requirements

Need help? Contact support or review the documentation:
https://docs.example.com/exchange-errors/6007
```

### 6.2 Localization

Support multiple languages via error message catalog:

```yaml
errors:
  6007:
    en: "Order Rejected\n\nYour order was rejected..."
    zh-CN: "订单被拒绝\n\n您的订单已被交易所拒绝..."
    ja: "注文が拒否されました\n\n..."
```

---

## 7. Error Recovery Procedures

### 7.1 Automated Recovery

Certain errors can be automatically healed:

| Error | Auto-Recovery Action |
|-------|----------------------|
| 2001 (Data missing) | Trigger download_data() automatically |
| 7001 (DB connection) | Wait and retry, recreate connection pool if needed |
| 6003 (Rate limit) | Respect `Retry-After`, implement token bucket |
| 9004 (Permission) | Fix permissions via chmod (if safe) or notify admin |

### 7.2 Manual Intervention Required

| Error | Manual Action |
|-------|---------------|
| 6002 (Auth failure) | User must update API keys |
| 6004 (Banned) | User must contact exchange support |
| 3002 (Strategy compile) | Developer must fix code |
| 5005 (Circuit breaker) | User must review strategy, may need to wait cooldown |
| 7004 (Disk full) | Admin must free disk space |

### 7.3 Self-Healing Strategies

```python
class SelfHealingManager:
    def attempt_heal(self, error_code, context):
        healing_strategies = {
            '2001': self._heal_missing_data,
            '6003': self._heal_rate_limit,
            '7001': self._heal_db_connection,
            '7002': self._heal_db_locked,
        }

        if error_code in healing_strategies:
            try:
                healing_strategies[error_code](context)
                return True, "Healing applied"
            except Exception as e:
                return False, f"Healing failed: {e}"
        return False, "No auto-healing for this error"

    def _heal_missing_data(self, context):
        pair = context['pair']
        exchange = context.get('exchange', 'binance')
        timeframe = context['timeframe']
        # Trigger automatic data download
        data_manager.download_data([pair], exchange, timeframe, auto=True)

    def _heal_rate_limit(self, context):
        # Already handled by retry decorator with backoff
        pass
```

---

## 8. Escalation Policies

### 8.1 Severity-Based Escalation

| Severity | Notification | Response Time | Escalation |
|----------|--------------|---------------|------------|
| `INFO` | Log only | N/A | None |
| `WARNING` | Log, dashboard alert | 1 hour | To on-call engineer |
| `ERROR` | Log, email, dashboard | 15 minutes | To on-call + team lead |
| `CRITICAL` | Log, email, SMS, dashboard, Slack | 5 minutes | To entire engineering team + management |

### 8.2 Error Deduplication

Avoid alert storm by grouping similar errors:

```python
from collections import defaultdict
from datetime import datetime, timedelta

class ErrorDeduplicator:
    def __init__(self, window_minutes=5):
        self.window = timedelta(minutes=window_minutes)
        self.error_counts = defaultdict(list)

    def should_alert(self, error_code, context):
        now = datetime.now()
        # Clean old entries
        self.error_counts[error_code] = [
            t for t in self.error_counts[error_code]
            if now - t < self.window
        ]

        count = len(self.error_counts[error_code])
        self.error_counts[error_code].append(now)

        # Only alert for first error or frequent repeats
        return count <= 3
```

---

## 9. Testing Error Handling

### 9.1 Fault Injection Testing

Use chaos engineering to test resilience:

```python
import pytest
from unittest.mock import patch

def test_exchange_rate_limit_retry():
    """Test that rate limit errors are properly retried."""
    with patch('exchange_adapter.fetch_ohlcv') as mock_fetch:
        # Simulate 429 on first two calls, success on third
        mock_fetch.side_effect = [
            ExchangeError("Rate limited", code='6003'),
            ExchangeError("Rate limited", code='6003'),
            [OHLCV_data]
        ]

        result = data_manager.fetch_ohlcv_with_retry(...)
        assert result == OHLCV_data
        assert mock_fetch.call_count == 3

def test_circuit_breaker_opens():
    """Test circuit breaker opens after repeated failures."""
    cb = CircuitBreaker(failure_threshold=3)

    @cb
    def flaky_func():
        raise ConnectionError("Network down")

    with pytest.raises(CircuitBreakerOpenError):
        for _ in range(5):
            flaky_func()

    assert cb.state == 'OPEN'
```

### 9.2 Error Path Coverage

Ensure all error branches are covered:

| Error Code | Test Case | Expected Behavior |
|------------|-----------|-------------------|
| 6001 | Network timeout | Retry with exponential backoff |
| 6003 | Rate limit 429 | Wait `Retry-After` header |
| 3002 | Syntax error in strategy | Fail immediately, no retry |
| 7001 | DB connection lost | Retry 3 times, then escalate |

---

## 10. Examples

### 10.1 Handling Exchange Timeout

```python
@retryable(max_retries=3, backoff_factor=2.0, retryable_codes=['6001'])
def get_balance_with_retry(exchange_id, asset):
    try:
        balance = exchange.get_balance(exchange_id, asset)
        return balance
    except ExchangeError as e:
        if e.code == '6001':
            # Network error - retry handled by decorator
            raise
        elif e.code == '6006':
            # Insufficient balance - no retry
            raise InsufficientFundsError(f"Insufficient {asset} balance")
        else:
            # Unknown error - log and re-raise
            logger.error(f"Unexpected exchange error: {e.code} - {e.message}")
            raise
```

### 10.2 Strategy Backtest with Fallback

```python
def run_backtest_with_fallback(strategy_id, pairs, start_date, end_date):
    try:
        # Primary: Compute backtest
        result = backtesting_engine.run(strategy_id, pairs, start_date, end_date)
        return result
    except (MemoryError, TimeoutError) as e:
        logger.warning(f"Backtest failed with resource error: {e}, falling back to partial computation")
        try:
            # Fallback 1: Reduce date range by half
            mid_date = start_date + (end_date - start_date) / 2
            result_partial = backtesting_engine.run(strategy_id, pairs, start_date, mid_date)
            result_partial['warning'] = 'Partial backtest due to resource constraints'
            result_partial['full_period_skipped'] = True
            return result_partial
        except Exception:
            # Fallback 2: Use cached results if available
            cached = cache.get(f"backtest:{strategy_id}:{start_date}:{end_date}")
            if cached:
                cached['warning'] = 'Using stale cache due to computation failure'
                return cached
            else:
                raise BacktestCriticalError("All fallback options exhausted")
```

---

## 11. Summary

This error handling design provides:

1. **Clear taxonomy** for consistent error identification
2. **Retry policies** tuned to error characteristics
3. **Circuit breakers** to prevent cascading failures
4. **Fallback chains** for graceful degradation
5. **Structured logging** for observability
6. **Automated healing** where possible
7. **Escalation procedures** for manual intervention

The system prioritizes:
- **Safety** over aggressive retries (no infinite loops)
- **Clarity** in error messages (actionable, translated)
- **Resilience** through redundancy and fallbacks
- **Observability** via structured logs and metrics

Implement this design with proper unit tests and chaos testing to validate behavior under failure conditions.
