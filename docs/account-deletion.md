# Deleting an account

How deleting an account works, and what support does when somebody writes in
to say they didn't mean it.

## How it works

1. **Asking.** In the editor, Settings → Data & Privacy → Delete account. The
   person types their email address and enters their password (an account that
   signs in only with Google or GitHub must have signed in within the last 10
   minutes instead). At that moment the account is locked, the boards it owns
   disappear for everyone, every session ends, and an email tells them when the
   deletion becomes final and to write to support@canvasflowapp.com to stop it.
2. **Waiting.** Nothing is erased for 7 days (`ACCOUNT_DELETION_GRACE_DAYS`).
   During that time support can restore the account, as below.
3. **Erasing.** The nightly job, **Purge deleted accounts** in GitHub Actions
   at 03:47 UTC, erases every account whose 7 days are up: its files first,
   then its rows. The account row stays behind as "Deleted user", so edits on
   other people's boards keep an author, and the request row becomes the
   receipt. After this, nothing can be restored.

## Restoring an account

Use this when somebody writes to support within the 7 days asking for their
account back. The email they received says the date; the tool below shows it
too.

### 1. Check it is really them

Only restore for a request sent **from the address on the account**. Anyone
can write in claiming to be somebody. If the message came from a different
address, reply to the account's own address and ask them to confirm from
there.

### 2. Look before changing anything

In the main repo terminal, point the tool at production the same way a
migration does:

```bash
cd ~/code/canvasflow
grep -E '^#\s*DATABASE_URL=' .env | head -1 | sed -E 's/^#\s*//' > ~/prod-db.env
grep -c 'ep-lucky-field' ~/prod-db.env
```

It must print **1**. If it prints 0, stop and run `rm ~/prod-db.env`.

Then put the address they wrote from between the quotes, and check it:

```bash
EMAIL='the-address-they-wrote-from@example.com'
echo "$EMAIL"
DATABASE_URL="$(cut -d= -f2- ~/prod-db.env)" pnpm --filter @canvasflow/db restore:account "$EMAIL"
```

This changes nothing. Check what it prints:

- **`Database:`** must name the `ep-lucky-field` host. Anything else is the
  wrong database.
- **The account line** is their name and address.
- **`Erased after`** is still in the future, with the time left beside it.
- **`Boards to bring back`** is how many of their boards come back.

What else it can say:

- **No account has the address**: check the spelling. If they deleted it more
  than 7 days ago, it is already erased.
- **No deletion is waiting**: the account is fine, or was already restored.
- **Its grace period ended**: too late. Send the "too late" reply below.
- **More than one account uses that address**: an old account from before
  addresses were case-insensitive. Run again with `--user` and the id of the
  one they mean.

### 3. Restore

The same command, with `--confirm`:

```bash
DATABASE_URL="$(cut -d= -f2- ~/prod-db.env)" pnpm --filter @canvasflow/db restore:account "$EMAIL" --confirm
rm ~/prod-db.env
```

It prints **Restored**. The account is unlocked, the boards it owned are
visible again to everyone they were shared with, and the security log records
`auth.account.deletion_cancelled`. Their sessions stay ended, so they need to
sign in again.

### 4. Reply

**Restored:**

> Your CanvasFlow account is back, with your boards. For your security, we
> signed you out everywhere when you asked to delete it, so please sign in
> again at https://canvasflowapp.com/login.
>
> If you didn't ask to delete your account yourself, someone else may have had
> access to it. Reset your password at https://canvasflowapp.com/forgot-password,
> then check Settings → Account & Security for devices you don't recognise.

For an account that signs in with Google or GitHub, replace the last paragraph
with: "If you didn't ask to delete your account yourself, someone else may
have had access to it. Check the security of your Google or GitHub account."

**Too late:**

> Your CanvasFlow account was deleted permanently after the 7 days we hold
> accounts for, so we can't restore it. You're welcome to sign up again with
> the same email address. If it says the address is already in use, try again
> the next day, once the deletion has finished.

### 5. Check it landed (optional)

Read-only, in the Neon SQL Editor on the **`canvasflow`** (production)
project, with their address in place of the example:

```sql
SELECT d.status, d.cancelled_at, u.disabled_at
FROM account_deletions d JOIN users u ON u.id = d.user_id
WHERE lower(u.email) = lower('the-address-they-wrote-from@example.com')
ORDER BY d.requested_at DESC LIMIT 1;
```

Expect `cancelled`, a `cancelled_at` time, and an empty `disabled_at`.

## Checking the nightly purge

Actions → **Purge deleted accounts** → the newest run → the **Purge** step. It
ends with a line like `Done: 1 purged, 0 failed, 0 waiting.` The log is public,
so it names requests by id and never by person.

If a run fails, GitHub emails you. The failed account is left as it was and
the next night's run tries it again. To look without changing anything, start
the workflow by hand with "Only report what would be deleted" ticked.

## Where the code is

- `packages/db/src/access/account-deletion.ts`: asking, restoring and erasing
  one account, in the database.
- `packages/db/src/access/account-purge.ts`,
  `packages/db/scripts/purge-deleted-accounts.ts` and
  `.github/workflows/purge-deleted-accounts.yml`: the nightly job.
- `packages/db/src/access/account-restore.ts` and
  `packages/db/scripts/restore-deleted-account.ts`: the restore tool above.
- `services/api-gateway/src/modules/account-deletion/`: the API behind the
  Delete account button.
- `apps/editor/src/settings/DeleteAccountOverlay.tsx`: the dialog.
- `apps/web/src/app/account-deleted/`: the page people land on afterwards.
