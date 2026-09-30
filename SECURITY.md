# Security policy

## Reporting a vulnerability

Please report security problems privately, using GitHub's private vulnerability
reporting:

1. Open the **Security** tab of this repository.
2. Choose **Report a vulnerability**.
3. Describe what you found and how to reproduce it.

Please do not open a public issue, pull request or discussion for a security
problem, and do not post details anywhere public until it has been fixed.

## What to expect

- We will acknowledge your report within 5 working days.
- Keia Atlas is a volunteer project in preview, so fixes are best effort and come with no guaranteed timescale. We will keep you told of progress and credit you if you wish.
- Safe harbour: we will not pursue or support action against anyone who researches and reports a problem in good faith, within the scope below.

## What is in scope

- The Keia Atlas site and its code: the pages, components, build tooling and
  scripts in this repository, and the Docker image built from it.
- Problems in the site's dependencies, when they affect Keia Atlas as shipped.

## What is not in scope

- The data. All companies, offices, people, rooms, devices and incidents in the
  demo data are fictional, so there is no real information to protect there. If
  you find real data in the demo, report it privately, in the same way as a
  vulnerability.
- Third-party software and services (for example GitHub Pages or Docker itself),
  which should be reported to their own maintainers.
- The Keia framework in `vendor/keia`; report issues with that to its own
  repository.

## Supported versions

Keia Atlas is in preview. Only the latest release (or the current `main` branch)
is supported and receives fixes.

## Keeping your own estate safe

- Never commit secrets. An estate repository describes your buildings and network: keep it private.
- Use vault references, never passwords, in YAML. The validator and the CI secret scan both check.
- Don't expose a build to the internet in front of real data; database mode will add sign-in.
