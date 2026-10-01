# Returns: how stock gets back out of the building

Supplier: **TriniphiX (Pvt) Ltd** · Client: **The Grand Gastrobar, Negombo**
Status: **as built**, verified end to end by `scripts/check-returns.mjs`

Companion documents: [System Architecture](system-architecture.md),
[Security & Access Control](security-and-access-control.md),
[CR-003](../02-contract/change-requests/CR-003-returns-to-store-and-supplier.md).

For the same flow without the engineering, written for the people running it:
[What actually happens to stock the kitchen sends back](../06-deployment/what-happens-to-returned-stock.md).

---

## 1. The short version

Bad stock leaves the building in **two documents, never one**.

```
  KITCHEN                    QUARANTINE                   SUPPLIER
  (or cleaning,                                               ▲
   or the store's                                             │
   own shelf)                                                 │
      │                           │                           │
      │   ①  section return       │   ②  supplier return      │
      └──────────────────────────►│──────────────────────────►┘
          stock moves NOW              stock moves ON SEND
```

**① A section return** is an internal movement that has already happened. The
chef opened the box, the fish was bad, the crate is on its way to the store
whatever anybody approves. So the ledger moves immediately — kitchen down,
quarantine up — and a manager reviews it afterwards. Same rule as wastage.

**② A disposal** has consequences whichever way it goes: a credit note and an
argument with the supplier, or a write-off. Both follow from a decision
management should make *before* anybody moves the crate. So the store asks, the
manager answers line by line — **back to the supplier, or into the bin** — and
the ledger moves only when the store carries that answer out, which is the
moment the stock actually leaves the building.

That asymmetry is the single thing to understand about this flow. Everything
below is a consequence of it.

---

## 2. Who does what

| Step | Who | Does stock move? | Where in the app |
|---|---|:--:|---|
| Hand stock back | The section holding it — kitchen, cleaning | **Yes** | Requests → **Return** on the release |
| Hand back the store's own bad stock | Storekeeper | **Yes** | Returns → *Something on our own shelf is bad* |
| Ask: claim it, or bin it? | Storekeeper | No | Returns → *Ask management what to do* |
| **Answer it, line by line** | **Management** | No | Supplier returns → *Send it back* / *Bin it* |
| Put it on the lorry | Storekeeper | **Yes** | Supplier returns → *It has gone* |
| Or bin it | Storekeeper | **Yes** | Supplier returns → *Bin them* |
| Record the credit note | **Management** | No | Supplier returns → *Credit note received* |

Two of those steps move stock. The rest are paperwork, and a screen that implies
otherwise is a screen that will be mistrusted the first time somebody counts the
shelf.

**Nobody does two steps in a row.** The storekeeper asks the question and
carries out the answer; management answers it and records what the supplier did. Neither can
do the other's half — the API refuses it, not just the menu — because an
approval you can grant yourself approves nothing.

**There is exactly one approval in the chain (CR-006).** It used to be two: a
stamp on the hand-back, which approved a movement that had already happened and
blocked nothing, and then a decision on the supplier return. The stamp is gone.
What management answers now is the question that actually matters — *what
becomes of this?* — and answering it accepts the hand-back as well.

---

## 3. Step by step, with what each step is for

### ① The section hands stock back

Kitchen and cleaning return **from Requests, against the release that delivered
the goods**. Not from a screen of their own, and not by naming an item out of
the whole master.

Why against the release:

- It is where the question actually comes up. The chef is looking at the
  request that brought the bad fish.
- It caps the quantity. You may hand back **what was released to you, less what
  you have already handed back, and never more than is still on your shelf**.
  All three are checked; the error message names all three figures.
- Without it, "return" becomes a way to move stock a section was never given.

**Returns close after seven days** (`RETURN_WINDOW_DAYS` in
`api/src/services/returns.ts`). After that nobody can honestly say the shelf
still holds what came in on that release, and the right instruments are wastage
("we spoiled it") or a stock count ("we cannot account for it"). Seven days is
a guess and is on the Phase 0 list to confirm with the owner.

Returning a whole release also **counts as confirming it arrived** — you cannot
hand back what never came — so the row leaves the "needs me" queue rather than
sitting there asking to be confirmed.

The store's own shelf is the one case a release cannot describe: that stock
arrived on a *delivery*, so there is no release to measure it against. That is
the drawer on the Returns screen, and it is the storekeeper's.

**Destination is resolved server-side.** A kitchen login never names quarantine
— it cannot even see it — so it returns *from* its own shelf and the server
works out where the goods go. A branch with no quarantine section is told so,
in words aimed at the person who can fix it.

### ② The storekeeper asks what to do with it

Opened from Returns (*Ask management what to do*), which carries the delivery
across so the next screen arrives **already filled in**: the delivery, the
reason and the packs.

It is an **ask**, not a claim. The store is not asserting that the goods go
back — it is putting the question to management with the delivery and the
quantities already worked out, so the answer can be an informed one: *claim
these 5 kg back from the supplier, or bin them?*

Three things are worth knowing about that suggestion:

- **The delivery is a guess, and stays editable.** Nothing in the ledger ties a
  crate in quarantine to the invoice it arrived on — goods come in on a GRN, go
  out to a section, come back. The chain is by item and quantity, not by
  identity. The guess is the most recent delivery of that item that still has
  returnable packs, which is right nearly always and wrong when the same item
  came in twice in a week. The screen says so.
- **The reason comes from the section return** that put the goods there,
  because the chef who opened the box is the one who knows what was wrong.
- **A suggestion you cannot submit as offered would be worse than none**, so
  pressing *Raise the return* without changing anything is accepted.
- **Stock that has already been asked about stops being suggested.** Raising an
  ask moves nothing — the crate stays on the quarantine shelf until it is sent
  or binned — so the suggestion, which is built from what quarantine holds,
  went on offering the same crate afterwards and invited a second claim against
  the same goods. Quantities on open asks are now subtracted from what the
  shelf is treated as holding. Only the part that is spoken for drops off: five
  litres with two claimed still offers three.

You may only send back what **quarantine actually holds**. Stock the kitchen has
not handed back yet, or that is still on the store's shelf, has to be returned
to the store first. The quantity box caps itself at the lesser of what the
invoice still has returnable and what quarantine physically holds.

The return is counted in **the packs of the original GRN line**, so nobody has
to remember six weeks later which pack it came in. The system keeps no prices:
what the supplier owes is for accounts, off the invoice.

### ③ Management answers, line by line

This is the real decision and the only approval in the chain. Each line gets
one of two answers:

| Answer | What it means | What it becomes |
|---|---|---|
| `vendor` | Claim a credit from the supplier | Goes on the lorry at step ④ |
| `waste` | Write the stock off | Binned at step ④, as a wastage document |

Both have consequences, which is why neither is a default and neither is styled
as the safe one.

**Every line must be answered.** A partial decision is refused with **400**. A
half-answered ask is how stock ends up sitting in quarantine for a month:
nobody is refusing it, nobody is claiming it, and it is on nobody's list.

Answering moves no stock: the crate is still in the building and the stock
figure says so.

### ④ The storekeeper carries the answer out

**The only step in the whole chain where the disposal touches the ledger.**

*It has gone* posts the `vendor` lines out of quarantine under the `return`
document, exactly as before. *Bin them* posts the `waste` lines out of
quarantine as **ordinary wastage documents**, under the reason `BADGOODS` — "Bad
goods, not taken back".

Binning is deliberately a real wastage document rather than a flag on the
return. It puts the write-off in the waste report, where "what did we throw
away" is asked, and keeps it out of the unexplained-loss report, where it would
read as theft. It is equally deliberately **not** `SPOIL`: we did not spoil it.

Both re-check that quarantine still holds what the line claims. Something may
have moved since the ask was raised — and if it has, the message says so rather
than posting a movement that drives a section negative.

Binning is idempotent per line: a line that already carries a wastage document
is skipped, so a double tap on a slow connection bins the crate once.

An ask whose lines were **all** binned closes itself as `settled` with outcome
`written_off`. There is no credit to chase, and leaving it open would put it on
the store's list forever.

Sending or binning before the answer is refused with **409**, and says why.

### ⑤ Management records what came back

Weeks later, usually, and **only for the lines that went back to the supplier**.
Anything binned needs no settlement — it was written off the moment it was
decided. Three outcomes:

| Outcome | What it means | What it needs |
|---|---|---|
| **Credit note received** | The supplier issued a credit note | The note number. The amount is for accounts |
| **Replaced** | Fresh goods arrived | Nothing — the replacement is an ordinary delivery |
| **Nothing back** | Written off | Nothing — the goods are gone and nothing came back |

A credit without its note number is refused. The point of recording a credit is
that accounts can find it against the statement, and a credit you cannot find on
the statement is a note in a diary.

---

## 4. No money, on purpose

The system keeps no prices (migration 0009). A return moves **quantities** in
the ledger, exactly like an issue. What the supplier owes, and what the credit
note was for, are accounts' figures off the invoice and the note - the system
records the note **number** so the two can be matched, and nothing more.

---

## 5. Known wrinkles

**A part-pack remainder can stay in quarantine.** A supplier return is counted
in packs, because that is how the supplier delivered it; quarantine is
counted in stock units. Hand back 16 ml of a 750 ml bottle and the return is
0.021 packs — three decimal places, 15.75 ml — so 0.25 ml stays on the
quarantine shelf. The alternative is claiming a fraction of a pack no supplier
will honour, so the residue is the right side of the trade. It is visible on the
Returns screen and immaterial; it clears the next time
that item goes back in a whole pack.

**The delivery behind a crate is inference, not fact.** See ③. If this ever
matters more than it does today, the fix is batch identity on receipt, which is
a schema change and a barcode conversation — explicitly out of scope.

**The quarantine panel reads `GET /quarantine`, not plain stock.** A stock
balance says what is on the shelf and nothing about whether anybody is already
dealing with it, so a crate already sitting on an ask showed under "waiting to
go back" with a button offering to ask about it a second time — and that button
led to a screen which, correctly, had nothing on it. The endpoint returns
`qtyOnOpenAsk` and `qtyFree` alongside the balance, from the same subtraction
the suggestion list makes, so the two screens cannot disagree.

**Quarantine can only be emptied by a disposal.** Nothing is ever issued out of
it, which is the point: faulty stock sitting in the main store's balance is
faulty stock the kitchen can ask for again tomorrow. It leaves either on a
lorry or in a bin, and both are answers to the same question.

---

## 6. Checking it

Two ways, and both should pass before anybody signs anything.

**Automatically**, against a running API with demo or trial data:

```bash
node scripts/check-returns.mjs
```

It drives the whole chain with three real logins, reads the quarantine balance
before and after **every** step, and asserts which steps move stock and which do
not — plus that each step refuses the wrong role. If nothing is currently
returnable it asks for stock and releases it first, so it runs from a freshly
seeded database in one command. It writes real documents, so never point it at a
live ledger.

**By hand**, the sequence in [HANDBOOK §3.5](../../HANDBOOK.md). The manual pass
is worth doing once even though the script exists: the script proves the rules
hold, and only a person can tell you whether the screen explains them.

The acceptance suite also covers this ground, in `api/test/returns.test.ts` —
38 tests, including the split decision (one line claimed, one binned, each
leaving quarantine by its own route), the refusal of a half-answered ask, and
the ones asserting management cannot raise an ask, bin anything or mark it
gone.
