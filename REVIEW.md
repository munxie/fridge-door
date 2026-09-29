# Fridge Door: a rundown

Written 29 Sep 2026, after building and deploying the app. No changes were made for this review; it documents what exists and what I concluded about it.

## 1. Why it exists

Three people share a kitchen, a bathroom, a hallway and a living room. Cleaning them is a classic public good: everyone benefits from a clean house, but each clean costs one person an hour. The person doing the work bears the whole cost and captures a third of the benefit. The rational short-term move is to let someone else do it, and if everyone reasons that way the house gets dirty. That is the free-rider problem, and every shared house runs into it.

Houses usually try to solve it with a rota on the fridge. Paper rotas fail for predictable reasons: nobody knows whose week it is without walking to the kitchen, there is no record of what was skipped, "I'll do it tomorrow" costs nothing to say, and enforcing the rota means one housemate confronting another, which is socially expensive enough that people avoid it and let things slide.

Fridge Door is that paper rota, made to work. It keeps the same shape (a squared-paper sheet held by a magnet) but fixes the failure modes: it is always in your pocket, it records who did what and when, it names the next person for the trash without anyone having to ask, and it nags on the house's behalf so no human has to. The reason it is styled like a piece of paper rather than a task manager is deliberate. It is meant to feel like something the three of you agreed on, not something one person imposed.

## 2. What it does

**Weekly duties.** Two chores each week, Oven (oven, stove, counters) and Sweeping (kitchen, living room, hallway). Three people rotate on a three-week cycle, so each week two people have one chore and one person is off. The deadline is Sunday 21:00. Your own chore is the first and largest thing on the sheet; the other person's chore is listed below with their name. Ticking your box draws a hand-drawn tick in your pen colour, prints a one-line quip, and fires confetti. Missing the deadline stamps the line "late" in red and carries it into next week until it's done.

**Trash.** A running log rather than a rota. Whoever took it out last determines who is next (the person after them in the fixed order). "Took it out" logs a turn; "take it back" undoes your own last entry; "full" flags the bin so the next person knows. Tally marks show each person's take-outs this month.

**Rooms.** Each room has a row where anyone can leave one mark: 👏 (thanks, nice job) or ? (who did this). Marks fade after three days so the sheet does not accumulate grudges.

**Handover.** In the "coming up" tab, any week's duty can be reassigned to someone else. The printed name is struck through and the new name written in, in the pen of whoever made the change, so it is visible that a swap happened and who arranged it.

**Streaks.** On-time weeks in a row per person and for the house. Four house weeks in a row turns the magnet gold. This is the only "reward" in the app.

**Reminders.** Push notifications on each phone that opts in. Two triggers: Saturday 10:00 if your chore is still open, and "Trash: you're up" once the bin has been flagged full for five minutes (the delay is an undo window), repeated daily while it stays full.

## 3. How it is built

- **One static page.** `index.html` holds the whole app: CSS, and about 400 lines of plain JavaScript with no framework and no build step. The rota, names, duties, quips and week-one date are constants at the top. Anyone can change them with a text editor.
- **Hosting.** GitHub Pages, from the `main` branch. Push to deploy, live within a minute. Free.
- **Database.** Supabase free tier, one table called `docs` with a text id and a JSON blob per row: one row per week, one for the trash log, one per room, one per phone that turned reminders on. There is no schema to migrate when the app changes shape.
- **Access control.** The house code is not stored in the app or the repo. Every request carries it as a header, and a Postgres function compares it inside a row-level-security policy. Without the code, the table is invisible. With it, you can read and write everything. There are no user accounts; you pick your name from a list and the phone remembers it.
- **Sync.** Writes are upserts. After each write the phone broadcasts "changed" on a realtime channel, and the other phones refetch. Phones also refetch when brought to the foreground and once a minute while open. Conflicts are not a practical concern with three users and whole-document writes.
- **Installable.** Web app manifest, service worker that caches the shell (network first, so updates arrive), app icons, standalone display so it runs without browser chrome. On iPhone this is also what makes push possible.
- **Reminders.** A Supabase Edge Function (Deno) holds the private push key and the rota logic, and sends web push via the standard VAPID protocol. A `pg_cron` job in the database calls it every five minutes with a secret header; the function works out Amsterdam local time and decides whether anything is due. The app itself only calls the function once, to send a test notification when you turn reminders on.
- **Cost.** Zero. The one operational caveat is that Supabase pauses free projects after seven days without traffic; three phones polling keeps it alive, and the dashboard has a one-click restore.

## 4. How people will actually use it

Realistically, not daily. The natural rhythm is:

- **Sunday afternoon.** The Saturday reminder landed the day before. You open the app, see "Sweeping" at the top with the detail list, do it, tick it, get confetti, close it. Thirty seconds of app time.
- **Taking out the trash.** Bag in hand, you tap "took it out" on the way back in. If you instead notice the bin is full and it is not your turn, you tap "full" and the next person's phone buzzes five minutes later. This is the interaction that will happen most often, because trash comes up several times a week and the app removes the "is it me?" question completely.
- **Being away.** You see next week is yours and you will be at your parents'. You open "coming up", tap your name, pick a housemate. They see the change in their pen colour with your name on the swap. Ideally you also ask them, but the sheet makes the arrangement visible either way.
- **Occasional gratitude or irritation.** Someone left the kitchen spotless: 👏 next to Kitchen. Someone left it a mess and you do not know who: ? next to Kitchen. Both are lighter than a message in the group chat.
- **Monthly glance.** The trash tallies and streaks are a passive scoreboard. Nobody needs to check them, but they are there when someone feels they are doing more than their share.

The app succeeds if each person opens it two or three times a week. The reminders are what make that likely; without them, the first busy fortnight would kill it, as it kills paper rotas.

## 5. The economics of cleaning properly

**The incentive problem.** A chore is a private cost for a shared benefit. Left alone, each person under-supplies cleaning and over-consumes the others' effort. With three people the problem is milder than in a house of eight, because you can see who did what, but the two things that usually break it are ambiguity ("was it my week?") and the cost of enforcement (nobody wants to be the nag).

**What the app changes.**

- *Ambiguity is gone.* The rota is explicit and the trash order is computed. You cannot honestly claim not to know it was your turn, which removes the cheapest excuse.
- *Monitoring is free.* Every tick, take-out and late stamp is visible to all three, in the doer's handwriting. Reputation is on the line every week. In a repeated game with a long horizon (you live together for a year or more), reputational cost is a real deterrent.
- *Enforcement is outsourced to the fridge.* The reminder comes from the app, not from a housemate. That is the biggest social gain: nobody has to spend goodwill nagging, and nobody has to feel nagged by a person.
- *Trades are cheap.* The handover feature is small-scale Coasean bargaining. If a chore is worth more to you next week than this week, you swap. The sheet records it so nobody forgets who owes whom.
- *There is a small positive payoff.* Quips, confetti, streaks and the gold magnet are trivial, but they turn "done" into a moment rather than nothing. Cheap carrots matter when the stick is only social.

**Why "properly" matters, in money and time.** A half-done clean transfers cost to the next person: grease left on the oven takes twice as long to remove next week. Neglected kitchens attract pests, which cost money and a lot of unpleasantness to fix. Landlords in the Netherlands routinely withhold deposit money for end-of-tenancy cleaning; a house kept clean weekly costs almost nothing to hand back, one cleaned only at the end can cost a few hundred euros in fees or lost deposit. And a genuinely dirty stove is a fire risk. Regular maintenance is cheaper than periodic rescue, which is the standard argument for every kind of maintenance.

**What the app does not do.** It records completion, not quality. A tick says "I did it", not "I did it well". The only quality signal is social: the 👏 and ? marks, and the fact that the next person on the same chore will notice. That is a real gap. If quality becomes a problem, the fix is not technical but a norm: the person who inherits a chore is entitled to a ? and the doer is expected to go back. A stronger lever, if the house ever wants one, is a small financial stake, for example five euros into a pot for every late week, with the pot paying for a house dinner. The app already produces the data that would need; it just does not collect money.

## 6. The interface

**What works.** One screen, your own chore first, no explanatory text, everything else behind three small tabs. The paper metaphor lowers the emotional temperature: a "late" rubber stamp on a rota feels different from a red overdue badge in a task app. Each person has a pen colour and a handwriting font, so authorship is visible without names everywhere. The phone-app polish (no pinch zoom, no text selection, status-bar bleed, install hint) makes it feel installed rather than browsed once it is on the home screen. The room buttons are now thumb-sized.

**What is weaker.**

- Handwriting fonts are charming but less legible than type, particularly the ochre pen on cream paper in sunlight.
- Before the first week (5 Oct 2026) the header reads "From Mon 5 Oct", which is correct but a little cryptic.
- The three tabs are quiet. "Coming up" is where handovers live and new users may not find it.
- Only the assignee can tick a chore. That is intentional (it stops people ticking for each other), but if you do someone's chore as a favour, you have to reassign it to yourself first. The path exists; it is two taps away and not obvious.
- The "reminders blocked" state can appear on desktop browsers where it means nothing.
- There is no notion of a guest or a fourth person. Adding a housemate means editing constants and the three-week rota.

## 7. Risks and limits

- **No authentication.** Anyone with the house code can act as anyone. For three housemates this is fine and keeps the app frictionless; it would not survive a larger or less trusting group.
- **Free-tier pause.** A quiet week (everyone away) can pause the database. Restore is one click but someone has to notice.
- **Hard-coded facts.** Names, rota, deadline (Sunday 21:00), time zone, and the week-one anchor live in code. Changing the rota mid-year needs care with the anchor date so past weeks do not shift.
- **Push on iPhone** requires adding to the Home Screen first and re-enabling if the icon is removed and re-added. Android is simpler.
- **Data retention** is modest: the trash log keeps the last 60 entries, room marks expire after three days, weeks accumulate indefinitely but are tiny.

## 8. Conclusion

The app is a well-scoped solution to a real, small coordination problem. It does not try to gamify housework or to be a general task manager. It makes the rota unambiguous, the record public, and the nagging impersonal, which are the three things a paper rota cannot do. The economics are sound: it lowers monitoring and enforcement costs to near zero and raises the reputational cost of skipping, in a repeated game where reputation matters. Its main vulnerability is abandonment, and the reminders are the right mitigation. Its main blind spot is quality, which is a social question the house should settle in conversation, possibly with a small stake, rather than something the app should try to measure.
