<p align="center">
  <a href="https://boundup.lewd.toys/">
    <img src="static/og-image.jpg" alt="Bound Up: explore your kinks and manage your dynamics, either with a partner or solo." width="720">
  </a>
</p>

<p align="center">
  <a href="https://boundup.lewd.toys/"><strong>Open Bound Up</strong></a>
  ·
  <a href="https://boundup.lewd.toys/roadmap">Roadmap</a>
  ·
  <a href="#run-your-own">Self-host</a>
  ·
  <a href="docs/development.md">Develop</a>
</p>

# Bound Up

**Explore your kinks and manage your dynamics. Either with a partner or solo.**

Bound Up is a private web app for kink and power-exchange dynamics. You can set
tasks and earn rewards, run guided edging sessions, and keep in touch with a
partner through messages only the two of you can read. Use it alone, or link
up with a partner and decide between you which of you is in control.


## Get started

Go to **[boundup.lewd.toys](https://boundup.lewd.toys/)** and
sign up. It runs in the browser on your phone or computer, and there is nothing
to download. On a phone you can add it to your home screen so it opens like an
app.

If you would rather keep everything on your own server, you can
[run your own copy](#run-your-own).

## What you can do

- **Tasks.** Set things to get done, for yourself or between you and your
  partner, one-off or on a schedule. Completing a task earns credits.
- **Rewards.** Make a list of treats and spend your credits on them. In a
  partnership, whoever is in control decides what is on offer.
- **Partners.** Invite someone with a link. Once you are linked, they get their
  own tab in the app, with their tasks, rewards and messages.
- **Messages.** Private conversations with your partner, organised into tagged
  threads. You can use formatting, link previews, and photos and videos that
  disappear after they have been seen. Anything you are halfway through typing
  is still there when you come back.
- **Guided sessions** _(early access)_. Step-by-step edging guides that count
  along with you and reveal what comes next as you go.
- **Time zones that follow you.** A task happens at the right time for the
  person it is set for, even if one of you travels or moves.

Plenty more is on the way, including chastity tracking, a kink list, and
logging edges and orgasms. The **[roadmap](https://boundup.lewd.toys/roadmap)**
shows what is being built, what is planned and what is still an idea.

## Private by design

- **Only you and your partner can read your messages.** They are encrypted on
  your device before they are sent. The server stores only the scrambled
  version and has no way to unscramble it.
- **Your password never leaves your device.** Your browser turns it into a
  key, and only a value derived from that key is sent to sign you in.
- **Passkeys.** Sign in with Face ID, a fingerprint or your password manager
  instead of a password.
- **Nothing to set up.** Signing in is all it takes. There are no extra keys,
  codes or passphrases to manage.

Since nobody else can read your messages, nobody can reset your password for
you by email either. If you lose every way into your account, a linked partner
can vouch for you and help you back in, and your messages with them come back
too.

The details, including exactly what the server can and cannot see, are in
[docs/encryption.md](docs/encryption.md).

## Run your own

Every release is published as a Docker image, so you can run Bound Up on your
own server with no other services needed:

```sh
BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose up -d
```

Start from [`docker-compose.yml`](docker-compose.yml), then sign up straight
away: the first account on a new server becomes its admin. Keep the secret
somewhere safe, because changing it signs everyone out. If the server sits
behind a reverse proxy, set `ORIGIN` to the address people will use.

[docs/self-hosting.md](docs/self-hosting.md) covers the settings, backups,
and how releases are versioned.

## Contributing

Bug reports and ideas are welcome in
[GitHub issues](https://github.com/secondfolder/bound-up/issues). Check the
[roadmap](https://boundup.lewd.toys/roadmap) first, since your idea may
already be on it.

To work on the code, start with [docs/development.md](docs/development.md) for
setup, tests and deployment, then [AGENTS.md](AGENTS.md) for the conventions
every change follows. Each feature has its own write-up in [docs/](docs/).
