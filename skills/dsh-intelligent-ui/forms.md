# Questions and forms

The reader answers in the widget; the answer reaches you as their next message.
You judge it in your reply. The widget never shows the answer, a hint that gives
it away, or a "check" button.

## One question, click an option

Write the stem, then one button per option. Each `data-prompt` is what the
reader would type: the letter and the option.

```html
<div class="card">
  <p><span class="badge accent">Question 2 of 5</span></p>
  <p>Which planet has the shortest year?</p>
  <div class="stack">
    <button data-prompt="A. Mercury">A. Mercury</button>
    <button data-prompt="B. Venus">B. Venus</button>
    <button data-prompt="C. Mars">C. Mars</button>
    <button data-prompt="D. Jupiter">D. Jupiter</button>
  </div>
</div>
```

When the answer arrives, say whether it is right, explain in a sentence or two,
and send the next question as a new widget if the set goes on.

## Typed answers and several answers at once

A `<form data-send="Lead">` sends one message when the reader submits it:
`Lead — Label: value · Label: value`. Each field needs a `name`. Its label is,
in order: a `data-label` on the field or around it, the `<legend>` of its
fieldset for radio buttons and checkboxes, its own `<label>`, or its name. A
checked option reads as its `value`, or as its label when it has none. Empty
fields and passwords are left out.

```html
<form data-send="My answers" class="card">
  <p>Fill in the blanks.</p>
  <label>Water boils at <input name="boil" data-label="1" inputmode="numeric" size="5" required> °C at sea level.</label>
  <label>The chemical formula of water is <input name="formula" data-label="2" size="6" required>.</label>
  <fieldset>
    <legend>3. Which are gases at room temperature?</legend>
    <label><input type="checkbox" name="gases" value="oxygen"> Oxygen</label>
    <label><input type="checkbox" name="gases" value="mercury"> Mercury</label>
    <label><input type="checkbox" name="gases" value="neon"> Neon</label>
  </fieldset>
  <button type="submit">Send my answers</button>
</form>
```

This sends, for example, `My answers — 1: 100 · 2: H2O · 3. Which are gases at
room temperature?: oxygen, neon`. Keep labels short with `data-label` when the
legend is long.

- `required`, `min`, `max`, and `pattern` work: the browser stops an incomplete
  form and shows why.
- Enter in a text field submits the form, as on any page.
- Inputs with an `id` keep their values after a reload. Give fields ids when the
  reader may come back to a long form.

## Lock it once sent

The widget can send again on every click. To make a form one-shot, keep that it
was sent and disable it:

```js
const form = document.querySelector('form')
function lock() {
  for (const field of form.elements) field.disabled = true
  form.querySelector('[type=submit]').textContent = 'Sent'
}
form.addEventListener('submit', () => { dsh.state.set({ sent: true }); lock() })
if (dsh.state.get()?.sent) lock()
```

The message is built before your handler runs, so disabling the fields in it is
safe.

## Choosing the shape

- One question with a few options: buttons with `data-prompt`.
- A word, a number, or a short phrase: a form with text inputs.
- Several questions answered together: one form, one fieldset per question.
- Preferences or a survey: a form with radio groups, checkboxes, and a select.
- Steps the reader works through without telling you: checkboxes with ids and
  no form; they keep their state, and a `metric` can count them.

## Checklists that count

```html
<div class="metric"><span class="label">Done</span><span class="value" id="done">0 of 3</span></div>
<label><input type="checkbox" id="c1"> Back up the database</label><br>
<label><input type="checkbox" id="c2"> Run the migration</label><br>
<label><input type="checkbox" id="c3"> Check the logs</label>
<script>
const boxes = [...document.querySelectorAll('input[type=checkbox]')]
const count = () => { document.getElementById('done').textContent = `${boxes.filter(box => box.checked).length} of ${boxes.length}` }
document.addEventListener('change', count)
count()
</script>
```
