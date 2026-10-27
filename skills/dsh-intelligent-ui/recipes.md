# Card recipes

Complete programs that compile without a repair. Adapt the names, bounds, and
labels to the question, and write the labels in the user's language.

## A subscription estimate with a plan choice

```dil
@state seats = 10 min=1 max=200
@state plan = "Pro" options=Basic|Pro|Enterprise
@state yearly = false
@calc rate = plan == "Enterprise" ? 45 : plan == "Pro" ? 29 : 12
@calc monthly = seats * rate * (yearly ? 0.8 : 1)
card "Team subscription"
  slider "Seats" bind=seats
  select "Plan" bind=plan
  checkbox "Pay yearly (20% off)" bind=yearly
  metric "Per month" value=monthly unit=USD
  keys items=["Per seat: {rate} USD", "Per year: {monthly * 12} USD"]
  callout "List prices before tax."
```

## A loan payment

```dil
@state principal = 300000 min=10000 max=1000000 step=10000
@state rate = 4.5 min=0.5 max=10 step=0.1
@state years = 30 min=5 max=40 step=1
@calc r = rate / 100 / 12
@calc n = years * 12
@calc payment = principal * r / (1 - (1 + r)^-n)
card "Monthly mortgage payment"
  slider "Loan" bind=principal unit=USD
  slider "Annual rate" bind=rate unit=%
  slider "Term" bind=years unit=years
  metric "Payment" value=payment unit=USD
  keys items=["Total paid: {fmt(payment * n, 0)} USD", "Interest: {fmt(payment * n - principal, 0)} USD"]
  plot "Balance owed by month" fn="principal * (1 + r)^m - payment * ((1 + r)^m - 1) / r" var=m from=0 to=n ymin=0
```

## A unit conversion

```dil
@state celsius = 20 min=-40 max=120
card "Temperature"
  slider "Celsius" bind=celsius unit=°C
  grid columns=2
    metric "Fahrenheit" value="celsius * 9 / 5 + 32" unit=°F
    metric "Kelvin" value="celsius + 273.15" unit=K
```

## Binomial probabilities

```dil
@state n = 20 min=1 max=100
@state p = 0.3 min=0.01 max=0.99 step=0.01
@state k = 6 min=0 max=100
@calc exactly = comb(n, k) * p^k * (1 - p)^(n - k)
@calc atMost = sum(comb(n, j) * p^j * (1 - p)^(n - j), j, 0, k)
card "Binomial probabilities"
  slider "Trials n" bind=n
  slider "Success probability p" bind=p
  slider "Successes k" bind=k
  grid columns=2
    metric "P(X = k)" value=exactly digits=4
    metric "P(X ≤ k)" value=atMost digits=4
  plot "Normal approximation" fn="exp(-(x - n*p)^2 / (2*n*p*(1 - p))) / sqrt(2*pi*n*p*(1 - p))" from=0 to=n
```

## The standard normal distribution

```dil
@state z = 1.96 min=-4 max=4 step=0.01
card "Standard normal"
  slider "z" bind=z
  formula "(1 + erf(z / sqrt(2))) / 2" label="P(Z ≤ z)" digits=4
  plot fn="exp(-x^2 / 2) / sqrt(2pi)" from=-4 to=4 shadeFrom=-4 shadeTo=z
```

## Projectile motion

```dil
@state speed = 20 min=1 max=50
@state angle = 45 min=5 max=85
@calc g = 9.81
@calc theta = rad(angle)
@calc distance = speed^2 * sin(2theta) / g
@calc peak = (speed * sin(theta))^2 / (2g)
card "Projectile without air resistance"
  slider "Launch speed" bind=speed unit=m/s
  slider "Angle" bind=angle unit=°
  grid columns=2
    metric "Range" value=distance unit=m digits=4
    metric "Peak height" value=peak unit=m digits=4
  plot "Trajectory" fn="x * tan(theta) - g * x^2 / (2 * speed^2 * cos(theta)^2)" from=0 to=distance ymin=0
```

## A quiz series

Send one question per card and wait for the reader's click before the next one.
Keep a running position in the title so the reader knows how far they are.

```dil
card "Question 3 of 5"
  text "True or false: every differentiable function is continuous."
  row
    button "True" prompt="True"
    button "False" prompt="False"
```

When the answer arrives, reply in prose: right or wrong, a two-line explanation,
then the next card. After the last question, summarise the score in prose; a
`table` of question, answer, and result works well for a review.

## Priced add-ons

Give each item its price in `values=`, in the same order as `items=`: `bind=`
receives the sum of the ticked prices and `names=` the ticked names, so the
total follows the ticks and the button tells you what the reader chose.

```dil
@state extra = 0
@state picked = ""
@calc total = 699 + extra
card "Phone with add-ons"
  checklist "Add-ons" items=["Case","Charger","Screen film"] values=[99, 149, 39] bind=extra names=picked
  metric "Total" value=total unit="CNY"
  button "Order these" prompt="I'll take the phone with: {picked}. Total {total} CNY."
```

Start the bound states at 0 and `""`, which is what nothing ticked gives.

## Revenue by source, with its split

Indent one `series` per quantity under the chart; `stacked=true` shows the total
as well as the parts. A pie beside it shows one month's split. A value may be a
quoted expression, so the charts follow the slider.

```dil
@state ads = 3 min=0 max=10 step=0.5
card "Revenue, January to April"
  chart shape=area stacked=true labels=["Jan","Feb","Mar","Apr"] unit="k USD"
    series "Subscriptions" values=[12, 14, 15, 18]
    series "Services" values=[5, 6, 8, 7]
    series "Ads" values=[2, 2, 3, "ads"]
  chart shape=pie labels=["Subscriptions","Services","Ads"] values=[18, 7, "ads"] caption="April"
  slider "April ad revenue" bind=ads unit="k USD"
```

Use `shape=bar` to set the series side by side, or `shape=line` for trends that
cross. The reader can hide a series from the legend.

## Code traced line by line

Trace the program by hand first, one frame per executed line, then write each
column of the trace as one `pick`. Frame 11 highlights no line, because the run
has ended.

```dil
@state frame = 1 min=1 max=11 step=1
@calc line = pick(frame, 1, 2, 3, 4, 2, 3, 4, 1, 2, 3, 0)
@calc i = pick(frame, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1)
@calc j = pick(frame, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0)
@calc items = pick(frame, "3 1 2", "3 1 2", "3 1 2", "1 3 2", "1 3 2", "1 3 2", "1 2 3", "1 2 3", "1 2 3", "1 2 3", "1 2 3")
@calc note = pick(frame, "First pass", "Compare positions 0 and 1", "3 > 1, so swap", "Swapped", "Compare positions 1 and 2", "3 > 2, so swap", "Swapped", "Second pass", "Compare positions 0 and 1", "1 > 2 is false", "Sorted")
card "Bubble sort on 3 1 2"
  code lang=python current=line numbers=true """
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
  """
  keys items=["i: {i}", "j: {j}", "a: {items}"]
  callout "{note}"
  player "Step" bind=frame unit="/ 11"
```

## A tangent sweeping a curve

```dil
@state x0 = -2 min=-2 max=2 step=0.01
card "The tangent along y = x³ − 3x"
  plot fn="x^3 - 3x" from=-2.5 to=2.5 ymin=-4 ymax=4 mark=x0 tangent=true
  metric "Slope f′(x)" value="deriv(x^3 - 3x, x, x0)" digits=3
  player "x" bind=x0 duration=6
```
