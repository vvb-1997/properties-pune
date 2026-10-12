# Multiple GitHub accounts on one Mac

Use one SSH key per account, one `Host` alias per account in `~/.ssh/config`, and one `includeIf` folder per account for commit identity.

Example accounts: `personal1`, `personal2`, `work`. Add more by repeating each step.

> GitHub's Terms of Service allow only one free personal account per person. Extra personal accounts risk suspension. Use free organizations to separate projects, or a work account owned by your employer. This guide assumes the accounts already exist.

## 1. Make one key per account

```bash
ssh-keygen -t ed25519 -C "personal1" -f ~/.ssh/id_ed25519_personal1
```

```bash
ssh-keygen -t ed25519 -C "personal2" -f ~/.ssh/id_ed25519_personal2
```

```bash
ssh-keygen -t ed25519 -C "work" -f ~/.ssh/id_ed25519_work
```

## 2. Load keys into the keychain

```bash
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_personal1 ~/.ssh/id_ed25519_personal2 ~/.ssh/id_ed25519_work
```

## 3. Add each public key to its own account

Copy a key:

```bash
pbcopy < ~/.ssh/id_ed25519_personal1.pub
```

Log into that account in the browser. Go to Settings → SSH and GPG keys → New SSH key. Paste and save. Log out. Repeat for `personal2` and `work` with their own `.pub` files. A key can sit on only one account.

## 4. Add one block per account to `~/.ssh/config`

```
Host github-personal1
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal1
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes

Host github-personal2
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal2
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes

Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_work
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
```

## 5. Test every alias

```bash
ssh -T git@github-personal1
```

```bash
ssh -T git@github-personal2
```

```bash
ssh -T git@github-work
```

Each must reply `Hi <username>!` with the right username.

## 6. Make one folder per account

```bash
mkdir -p ~/personal1 ~/personal2 ~/work
```

## 7. Route identity by folder in `~/.gitconfig`

```
[includeIf "gitdir:~/personal1/"]
  path = ~/.gitconfig-personal1

[includeIf "gitdir:~/personal2/"]
  path = ~/.gitconfig-personal2

[includeIf "gitdir:~/work/"]
  path = ~/.gitconfig-work
```

Make one file per account. Example `~/.gitconfig-personal1`:

```
[user]
  name = Your Name
  email = 11111111+personal1user@users.noreply.github.com
```

Find each noreply email in that account's Settings → Emails. Tick "Keep my email addresses private".

## 8. Clone with the matching alias, inside the matching folder

```bash
cd ~/personal2 && git clone git@github-personal2:USER/repo.git
```

Fix an existing repo:

```bash
git remote set-url origin git@github-personal2:USER/repo.git
```

## 9. Verify in each repo

```bash
git config user.email
```

```bash
git remote -v
```

The email and the alias must both match the folder's account. If the folder, alias, and email do not all agree, commits land under the wrong identity and pushes go to the wrong account.

## Notes

- Do not use HTTPS with a password. GitHub rejects passwords for git.
- The `gh` CLI holds one login at a time. Switch with `gh auth switch`.
