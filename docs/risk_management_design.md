# Risk Management Module Detailed Design

## 1. Overview

The Risk Management Module provides a **three-layer protection system** for quantitative trading strategies:

1. **Position Sizing Layer** (Strategy-level) - Controls risk per individual trade
2. **Portfolio Risk Layer** (Portfolio-level) - Manages overall portfolio exposure and correlation
3. **System Circuit Breaker Layer** (System-level) - Emergency shutdown mechanisms

This layered approach ensures that failures at one level are caught by subsequent levels, providing defense-in-depth.

---

## 2. Layer 1: Position Sizing

### 2.1 Goal

Determine the optimal amount to invest in a single trade based on account balance and risk tolerance.

### 2.2 Available Methods

#### 2.2.1 Fixed Ratio Method (`fixed_ratio`)

Simplest approach: risk a fixed percentage of total balance per trade.

**Formula**:

```
position_size = balance * risk_per_trade
risk_amount = position_size * stoploss_pct
```

**Parameters**:
- `balance`: Total account balance
- `risk_per_trade`: Fraction of balance to risk (e.g., 0.02 = 2%)
- `stoploss_pct`: Stop loss distance from entry (e.g., 0.1 = 10%)

**Example**:
- Balance = $10,000
- risk_per_trade = 0.02 (2%)
- stoploss_pct = 0.1 (10%)

```
position_size = 10000 * 0.02 = $200
units = position_size / current_price
risk_amount = 200 * 0.1 = $20  (2% of balance)
```

**Constraints**:
- position_size must be ≥ min_position_size (exchange specific)
- position_size must be ≤ max_position_size (optional cap)
- risk_amount / stoploss_pct = position_size

#### 2.2.2 Fixed Amount Method (`fixed_amount`)

Risk a fixed monetary amount per trade.

**Formula**:

```
risk_amount = fixed_risk_amount
position_size = risk_amount / stoploss_pct
```

**Use Case**: When you want consistent dollar exposure regardless of balance.

#### 2.2.3 Kelly Criterion (`kelly` / `kelly_fraction`)

Mathematical formula for optimal bet sizing based on historical win rate and win/loss ratio.

**Full Kelly Formula**:

```
f* = (p * b - q) / b
where:
  p = win_rate (probability of winning)
  q = 1 - p (probability of losing)
  b = average_win / average_loss  (win/loss ratio)
```

**Half Kelly** (recommended for safety): `f = f* / 2`

**Parameters**:
- `win_rate`: Historical win rate (0 to 1)
- `avg_win`: Average profit winning trades (positive)
- `avg_loss`: Average loss on losing trades (positive)

**Example**:
- win_rate = 0.55
- avg_win = $100
- avg_loss = $50
- b = 100 / 50 = 2
- f* = (0.55 * 2 - 0.45) / 2 = (1.1 - 0.45) / 2 = 0.325
- f (half kelly) = 0.1625

If balance = $10,000:
```
position_size = 10000 * 0.1625 = $1,625
```

**Risk of Ruin Estimate**:
```
risk_of_ruin ≈ (1 - f*)^(n) where n = number of consecutive losses needed to lose half capital
```

**Limitations**:
- Requires sufficient trade history (≥20 trades recommended)
- Assumes statistics are stable over time
- Conservative: use fractional Kelly (0.5 or 0.25)

#### 2.2.4 Risk-Adjusted Method (`risk_adjusted`)

Combine multiple factors: volatility (ATR), correlation, and recent performance.

**Formula**:

```
volatility_factor = current_atr / average_atr(recent)
correlation_penalty = max_correlation_with_open_positions
performance_bonus = 1 + (recent_win_rate - 0.5) * 0.5

adjusted_risk = base_risk_per_trade * volatility_factor * correlation_penalty * performance_bonus
position_size = balance * adjusted_risk / stoploss_pct
```

### 2.3 Position Sizing Algorithm

```python
def calculate_position_size(balance, risk_per_trade, stoploss_pct, method='fixed_ratio', **kwargs):
    """
    Calculate position size using specified method.

    Returns:
        {
            'position_size': float,   # in quote currency
            'units': float,           # base currency amount
            'risk_amount': float,     # amount at risk
            'method_used': str
        }
    """
    VALID_METHODS = ['fixed_ratio', 'fixed_amount', 'kelly', 'kelly_fraction', 'risk_adjusted']

    if method not in VALID_METHODS:
        raise ValueError(f"Invalid method. Choose from {VALID_METHODS}")

    # Apply exchange minimums
    min_size = kwargs.get('min_position_size', 10.0)
    max_size = kwargs.get('max_position_size', balance * 0.5)

    if method == 'fixed_ratio':
        position_size = balance * risk_per_trade
        risk_amount = position_size * stoploss_pct

    elif method == 'fixed_amount':
        risk_amount = kwargs['fixed_risk_amount']
        position_size = risk_amount / stoploss_pct

    elif method in ('kelly', 'kelly_fraction'):
        win_rate = kwargs['kelly_win_rate']
        avg_win = kwargs['kelly_avg_win']
        avg_loss = kwargs['kelly_avg_loss']
        kelly_f = (win_rate * (avg_win/avg_loss) - (1 - win_rate)) / (avg_win/avg_loss)
        kelly_f = max(0, min(1, kelly_f))  # Clamp to [0, 1]

        if method == 'kelly_fraction':
            kelly_f *= 0.5  # Half Kelly

        position_size = balance * kelly_f

    elif method == 'risk_adjusted':
        # Complex calculation with multiple factors
        position_size = _risk_adjusted_calc(balance, risk_per_trade, stoploss_pct, kwargs)

    # Clamp to exchange limits
    position_size = max(min_size, min(position_size, max_size))

    return {
        'position_size': position_size,
        'units': position_size / kwargs['current_price'],
        'risk_amount': position_size * stoploss_pct,
        'method_used': method
    }
```

---

## 3. Layer 2: Dynamic Stop-Loss

### 3.1 Goal

Adjust stop-loss price dynamically as trade moves in our favor to lock in profits while allowing volatility.

### 3.2 Stop-Loss Types

#### 3.2.1 Fixed Stop-Loss (`fixed`)

Static stop based on percentage from entry.

**Formula**:
```
stop_price = entry_price * (1 - stoploss_pct)
```

**Example**:
- Entry = $100
- stoploss_pct = 0.1 (10%)
- Stop = $90

**Pros**: Simple, predictable
**Cons**: Doesn't adapt to trend

#### 3.2.2 Trailing Stop-Loss (`trailing`)

Stop follows price at a fixed distance when new highs are made.

**Update Logic**:

```
highest_high = max(highest_high, current_price)
stop_price = highest_high * (1 - trailing_offset)

# Only moves up, never down (unless exit signal)
```

**Parameters**:
- `trailing_offset`: Distance from highest high (e.g., 0.02 = 2%)

**Example**:
- Entry = $100, trailing_offset = 2%
- Price rises to $120 → new stop = 120 * 0.98 = $117.60
- Price rises to $150 → new stop = $147
- Price drops to $117 → stop triggers, profit = 17%

**Implementation**:

```python
def update_trailing_stop(current_price, highest_high, trailing_offset, current_stop):
    if current_price > highest_high:
        highest_high = current_price
        new_stop = highest_high * (1 - trailing_offset)
        # Only move stop up
        if new_stop > current_stop:
            return highest_high, new_stop
    return highest_high, current_stop
```

#### 3.2.3 ATR-Based Stop-Loss (`atr`)

Use Average True Range for volatility-adjusted stops.

**Formula**:

```
stop_price = entry_price - (atr_value * atr_multiplier)
```

**Parameters**:
- `atr_value`: Current ATR (e.g., 14-period)
- `atr_multiplier`: Multiplier (typically 2-4)

**Advantages**:
- Adapts to market volatility
- Wider stops in volatile markets, tighter in calm markets

**Update**: ATR-based stop is usually **static** (based on entry) or can **trail**:

```
trailing_atr_stop = current_price - (current_atr * atr_multiplier)
# Note: current_atr changes over time
```

#### 3.2.4 Bollinger Band Stop (`bollinger`)

Place stop below lower Bollinger Band.

**Formula**:

```
lower_band = SMA(period) - (std_dev * multiplier)
stop_price = lower_band * (1 - safety_margin)
```

**Use Case**: Trend-following strategies that respect mean reversion boundaries.

#### 3.2.5 High-Low Stop (`high_low`)

Based on recent price action (swing highs/lows).

**Implementation**:

```
recent_low = min(low_prices[-lookback_periods:])
stop_price = recent_low * (1 - buffer_pct)
```

### 3.3 Dynamic Stop-Loss Function

```python
def calculate_dynamic_stoploss(entry_price, current_price, method='fixed', **kwargs):
    """
    Calculate stop loss price dynamically.

    Parameters:
        entry_price: Original entry price
        current_price: Current market price
        method: One of ['fixed', 'trailing', 'atr', 'bollinger', 'high_low']
        **kwargs: Method-specific parameters

    Returns:
        {
            'stop_price': float,
            'distance_pct': float,  # from current price
            'method_used': str,
            'needs_update': bool,   # True if stop should be moved
            'highest_high': float   # For trailing (state tracking)
        }
    """
    if method == 'fixed':
        stop_price = entry_price * (1 - kwargs['stoploss_pct'])
        return {
            'stop_price': stop_price,
            'distance_pct': (current_price - stop_price) / current_price,
            'method_used': 'fixed',
            'needs_update': False
        }

    elif method == 'trailing':
        highest_high = kwargs.get('highest_high', entry_price)
        trailing_offset = kwargs['trailing_offset']

        if current_price > highest_high:
            highest_high = current_price

        new_stop = highest_high * (1 - trailing_offset)
        current_stop = kwargs.get('current_stop', entry_price * (1 - 999))

        needs_update = new_stop > current_stop
        stop_price = max(current_stop, new_stop)

        return {
            'stop_price': stop_price,
            'distance_pct': (current_price - stop_price) / current_price,
            'method_used': 'trailing',
            'needs_update': needs_update,
            'highest_high': highest_high
        }

    elif method == 'atr':
        atr_value = kwargs['atr_value']
        atr_multiplier = kwargs.get('atr_multiplier', 2.0)
        is_trailing = kwargs.get('is_trailing', False)

        if is_trailing:
            stop_price = current_price - (atr_value * atr_multiplier)
        else:
            stop_price = entry_price - (atr_value * atr_multiplier)

        distance_pct = (current_price - stop_price) / current_price
        return {
            'stop_price': stop_price,
            'distance_pct': distance_pct,
            'method_used': 'atr_trailing' if is_trailing else 'atr_fixed',
            'needs_update': is_trailing
        }
```

---

## 4. Layer 3: System Circuit Breaker

### 4.1 Goal

Detect abnormal market conditions or strategy failure and trigger protective actions: pause, reduce exposure, or full stop.

### 4.2 Circuit Breaker Triggers

#### 4.2.1 Drawdown-Based

Trigger when portfolio drawdown exceeds threshold.

**Metrics**:
- **Max Drawdown (from peak)**:
  ```
  current_balance / peak_balance - 1
  ```

- **Daily/Weekly Loss**:
  ```
  (balance_today - balance_yesterday) / balance_yesterday
  ```

- **Peak-to-Trough**:
  ```
  (peak - trough) / peak
  ```

#### 4.2.2 Consecutive Losses

Count of losing trades in a row.

```
consecutive_losses = 0
for trade in recent_trades[-N:]:
    if trade.profit < 0:
        consecutive_losses += 1
    else:
        break
```

Trigger if `consecutive_losses >= threshold` (e.g., 5).

**Rationale**: Strategy might be out of sync with market regime.

#### 4.2.3 Volatility Spike

Compare current volatility to recent average.

```
current_atr = calculate_atr(recent_periods=1)
avg_atr_recent = calculate_atr(recent_periods=20)
volatility_ratio = current_atr / avg_atr_recent

if volatility_ratio > threshold (e.g., 2.0):
    trigger
```

#### 4.2.4 Sharpe Ratio Drop

Calculate rolling Sharpe over recent trades.

```
recent_profits = [t.profit_pct for t in trades[-N:]]
sharpe = mean(recent_profits) / std(recent_profits) * sqrt(annual_factor)

if sharpe < threshold (e.g., 0.5):
    trigger
```

#### 4.2.5 Win Rate Crash

```
recent_win_rate = count(profit > 0) / N
if recent_win_rate < threshold (e.g., 0.3 for N=20):
    trigger
```

### 4.3 Circuit Breaker Actions

| Trigger Level | Condition | Action |
|---------------|-----------|--------|
| **Warning** | Drawdown > 5% OR 3 consecutive losses | Log warning, increase monitoring |
| **Caution** | Drawdown > 10% OR 5 consecutive losses OR vol_spike > 1.5x | Reduce position size to 50% |
| **Hard Stop** | Drawdown > 20% OR 7 consecutive losses OR sharpe < 0 for 15 trades | STOP ALL TRADING for 24h, send alert |
| **Emergency** | Balance < 50% of initial OR 10 consecutive losses | STOP IMMEDIATELY, require manual review |

### 4.4 Circuit Breaker Implementation

```python
def check_circuit_breaker(balance, initial_balance, trade_history, thresholds=None):
    """
    Check all circuit breaker conditions.

    Parameters:
        balance: Current balance
        initial_balance: Starting balance (or peak)
        trade_history: List of Trade objects with profit, timestamp
        thresholds: Dict of threshold values

    Returns:
        {
            'circuit_breaker_triggered': bool,
            'reasons': list,
            'current_drawdown': float,
            'consecutive_losses': int,
            'recommended_action': str  # 'continue', 'pause', 'stop_trading', 'reduce_position'
        }
    """
    default_thresholds = {
        'daily_loss_pct': 0.05,
        'weekly_loss_pct': 0.10,
        'max_drawdown_pct': 0.20,
        'consecutive_losses': 5,
        'volatility_spike': 2.0,
        'min_sharpe_rolling': 0.5
    }
    thresholds = {**default_thresholds, **(thresholds or {})}

    reasons = []
    actions = []
    current_drawdown = (initial_balance - balance) / initial_balance if initial_balance > 0 else 0

    # 1. Drawdown check
    if abs(current_drawdown) >= thresholds['max_drawdown_pct']:
        reasons.append(f"Max drawdown {current_drawdown:.2%} exceeded threshold {thresholds['max_drawdown_pct']:.2%}")
        actions.append('stop_trading')

    # 2. Consecutive losses
    consecutive_losses = 0
    for trade in reversed(trade_history):
        if trade['profit'] < 0:
            consecutive_losses += 1
        else:
            break

    if consecutive_losses >= thresholds['consecutive_losses']:
        reasons.append(f"{consecutive_losses} consecutive losses (threshold: {thresholds['consecutive_losses']})")
        actions.append('stop_trading' if consecutive_losses >= 7 else 'reduce_position')

    # 3. Volatility spike
    volatility_ratio = kwargs.get('current_volatility', 1.0) / kwargs.get('avg_volatility', 1.0)
    if volatility_ratio >= thresholds['volatility_spike']:
        reasons.append(f"Volatility spike: {volatility_ratio:.2f}x average")
        actions.append('reduce_position' if volatility_ratio < 3.0 else 'pause')

    # 4. Sharpe ratio
    if 'recent_returns' in kwargs:
        sharpe = calculate_sharpe(kwargs['recent_returns'])
        if sharpe < thresholds['min_sharpe_rolling']:
            reasons.append(f"Rolling Sharpe {sharpe:.2f} below threshold {thresholds['min_sharpe_rolling']}")
            actions.append('reduce_position')

    # Determine final action based on highest severity
    if 'stop_trading' in actions:
        action = 'stop_trading'
    elif 'reduce_position' in actions:
        action = 'reduce_position'
    elif len(reasons) > 0:
        action = 'pause'
    else:
        action = 'continue'

    return {
        'circuit_breaker_triggered': len(reasons) > 0,
        'reasons': reasons,
        'current_drawdown': current_drawdown,
        'consecutive_losses': consecutive_losses,
        'recommended_action': action,
        'volatility_ratio': volatility_ratio if 'current_volatility' in kwargs else None,
        'all_clear': action == 'continue'
    }
```

### 4.5 Reset Mechanism

Circuit breakers should have automatic reset after cooling-off periods:

| Action | Cooling Period | Reset Condition |
|--------|----------------|-----------------|
| reduce_position | 1 hour | Return to normal if no new trigger for 1h |
| pause | 24 hours | Manual resume required (safety) |
| stop_trading | 7 days | Requires human approval to restart |
| Emergency stop | Permanent until code/strategy review | Written post-mortem required |

---

## 5. Integration: Three-Layer Protection Flow

### 5.1 Decision Flowchart

```
┌─────────────────────────────────────┐
│   Trade Signal Received             │
└─────────────┬───────────────────────┘
              │
              ▼
      ┌──────────────────┐
      │ Layer 1: Position│
      │ Sizing Calculator│
      └────────┬─────────┘
               │
               ▼
      Position Size = min(available, calculated)
               │
               ▼
      ┌──────────────────┐
      │ Layer 2: StopLoss│
      │ Set stop_price   │
      └────────┬─────────┘
               │
               ▼
      ┌────────────────────────┐
      │ Layer 3: Circuit Brkr  │
      │ Check: Any active?     │
      └────────┬───────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
    YES                 NO
     │                    │
     ▼                    ▼
  Reduce/Skip        Execute Trade
  according to
  action level
     │
     ▼
  Monitoring
  (continuous)
```

### 5.2 Continuous Monitoring Loop

```python
def risk_monitoring_loop(balance, positions, trade_history, interval_minutes=5):
    """
    Continuous background task that checks risk metrics.
    """
    while True:
        metrics = calculate_risk_metrics(balance, positions, trade_history)

        # Circuit breaker check
        cb_result = check_circuit_breaker(
            balance=balance,
            initial_balance=initial_balance,
            trade_history=trade_history[-50:],
            thresholds=current_thresholds
        )

        if cb_result['circuit_breaker_triggered']:
            action = cb_result['recommended_action']
            logger.warning(f"Circuit breaker triggered: {cb_result['reasons']}")

            if action == 'reduce_position':
                # Reduce position sizing multiplier for next trades
                position_multiplier = 0.5
            elif action == 'pause':
                # Block new trades for cooling period
                pause_until = now() + timedelta(hours=24)
            elif action == 'stop_trading':
                # Emergency stop - require manual intervention
                send_alert(cb_result)
                trading_enabled = False

        # Adjust position sizing based on current risk
        if metrics['current_drawdown'] > 0.1:
            risk_multiplier = 0.7
        elif metrics['current_drawdown'] > 0.05:
            risk_multiplier = 0.85
        else:
            risk_multiplier = 1.0

        sleep(interval_minutes * 60)
```

---

## 6. Risk Metrics Calculation

### 6.1 Portfolio-Level Risk

```python
def calculate_portfolio_risk(balance, positions, correlation_matrix=None):
    """
    Calculate portfolio-level risk metrics.
    """
    total_risk_exposure = 0
    position_weights = []
    returns_data = []

    for pos in positions:
        risk_amount = pos['units'] * (pos['entry_price'] - pos['stop_loss'])
        total_risk_exposure += risk_amount
        position_weights.append(pos['position_value'] / balance)
        returns_data.append(pos['unrealized_pnl_pct'])

    # Value at Risk (VaR) - Simplified (historial)
    if len(returns_data) >= 20:
        var_95 = np.percentile(returns_data, 5) * balance
    else:
        var_95 = None

    # Maximum position concentration
    max_weight = max(position_weights) if position_weights else 0

    # Correlation penalty (if matrix provided)
    correlation_penalty = 1.0
    if correlation_matrix and len(positions) > 1:
        avg_corr = average_correlation(positions, correlation_matrix)
        correlation_penalty = 1 + avg_corr  # Increase risk for high correlation

    effective_risk = total_risk_exposure * correlation_penalty

    return {
        'total_risk_exposure': total_risk_exposure,
        'risk_to_balance_pct': total_risk_exposure / balance if balance > 0 else 0,
        'max_position_pct': max_weight,
        'value_at_risk_95': var_95,
        'effective_risk': effective_risk,
        'num_positions': len(positions)
    }
```

### 6.2 Drawdown Tracking

```python
class DrawdownTracker:
    def __init__(self):
        self.peak_balance = 0
        self.current_drawdown = 0
        self.max_drawdown_seen = 0
        self.drawdown_start = None
        self.recovery_time = None

    def update(self, current_balance):
        if current_balance > self.peak_balance:
            # New peak
            self.peak_balance = current_balance
            if self.current_drawdown == 0 and self.recovery_time:
                self.recovery_time = now() - self.drawdown_start
            self.current_drawdown = 0
        else:
            # In drawdown
            self.current_drawdown = (self.peak_balance - current_balance) / self.peak_balance
            if self.current_drawdown > self.max_drawdown_seen:
                self.max_drawdown_seen = self.current_drawdown
                self.drawdown_start = now()

        return self.current_drawdown, self.max_drawdown_seen
```

---

## 7. Configuration

### 7.1 Risk Profile Schema

```yaml
risk_profile:
  position_sizing:
    method: "fixed_ratio"  # or "kelly", "risk_adjusted"
    risk_per_trade: 0.02   # 2%
    min_position_size: 10.0
    max_position_size: 10000.0
    kelly_fraction: 0.5    # Half Kelly (if using kelly)

  stop_loss:
    method: "trailing"     # or "fixed", "atr"
    stoploss_pct: 0.10     # For fixed
    trailing_offset: 0.02  # 2% for trailing
    atr_multiplier: 2.0    # For ATR
    atr_period: 14

  circuit_breaker:
    enabled: true
    max_drawdown_pct: 0.20
    daily_loss_pct: 0.05
    weekly_loss_pct: 0.10
    consecutive_losses: 5
    volatility_spike: 2.0
    min_rolling_sharpe: 0.5
    cooldown_periods:
      reduce_position: "1h"
      pause: "24h"
      stop_trading: "7d"

  portfolio:
    max_positions: 10
    max_correlation: 0.7
    max_single_position_pct: 0.20
    rebalance_threshold: 0.05
```

### 7.2 Dynamic Adjustment Factors

```python
# Risk multiplier based on recent performance
def get_risk_multiplier(recent_win_rate, recent_sharpe):
    if recent_win_rate > 0.6 and recent_sharpe > 1.5:
        return 1.2  # Increase risk when performing well
    elif recent_win_rate < 0.4 or recent_sharpe < 0.5:
        return 0.7  # Decrease risk when performing poorly
    else:
        return 1.0  # Normal
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

- `test_position_sizing_fixed_ratio()`
- `test_position_sizing_kelly()`
- `test_trailing_stop_update()`
- `test_circuit_breaker_drawdown_trigger()`
- `test_circuit_breaker_consecutive_losses()`
- `test_portfolio_risk_concentration()`

### 8.2 Integration Tests

- Simulate a series of trades with known P&L, verify position sizing follows risk rules
- Simulate volatile market with ATR spikes, verify ATR stop adjusts correctly
- Simulate drawdown scenario, verify circuit breaker triggers at correct threshold

### 8.3 Stress Tests

- Large number of positions (50+) - does correlation calculation scale?
- Extreme values (balance near zero, very small position sizes)
- Parameter edge cases: risk_per_trade = 0.001, stoploss_pct = 0.001

---

## 9. Monitoring & Alerts

### 9.1 Metrics to Track

- Current drawdown (%)
- Risk exposure (absolute and % of balance)
- Position count
- Consecutive losses
- Volatility ratio
- Sharpe ratio (rolling)
- Time since last trade

### 9.2 Alert Channels

- Log (INFO for normal, WARN for approaching limits, ERROR for triggers)
- Webhook to monitoring system
- Email/Telegram notification on circuit breaker activation

### 9.3 Dashboard

| Metric | Current | Threshold | Status |
|--------|---------|-----------|--------|
| Drawdown | 8.2% | 20% | OK |
| Consecutive Losses | 2 | 5 | OK |
| Volatility Ratio | 1.3x | 2.0x | OK |
| Risk Exposure | $1,500 | $2,000 | OK |
| Positions | 7 | 10 | OK |

---

## 10. Future Enhancements

1. **Adaptive Kelly**: Dynamically adjust Kelly fraction based on confidence in win rate estimate (Bayesian approach)
2. **Machine Learning Risk Model**: Use trained model to predict volatility and adjust stops accordingly
3. **Cross-Strategy Risk Aggregation**: If running multiple strategies, aggregate risk across all
4. **Liquidity Slippage Models**: Incorporate order book depth into position sizing
5. **Tail Risk Hedging**: Automatically purchase options when circuit breaker indicators spike
6. **Correlation-Based Position Sizing**: Reduce position sizes when new trade is highly correlated with existing positions

---

## 11. Conclusion

The three-layer protection system provides a robust framework for managing trading risk:

- **Layer 1** ensures no single trade can catastrophically damage the account
- **Layer 2** protects profits and limits downside on each trade
- **Layer 3** monitors overall strategy health and intervenes when conditions deteriorate

This design balances automation with safety, allowing the system to trade autonomously while having guardrails to prevent runaway losses.
