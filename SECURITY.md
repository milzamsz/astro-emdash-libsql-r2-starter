# Security Policy

- Report vulnerabilities privately to the downstream owner.
- Never expose libSQL publicly.
- Use least-privilege R2 credentials scoped to one bucket.
- Keep secrets outside Git and Docker layers.
- Root may bootstrap a mode-600 secret mount, but Node must run as UID/GID 10001.
- Treat uploaded SVG/HTML as active content; enforce sandbox/nosniff/attachment controls.
- Require authentication/authorization for CMS mutations.
- Rotate credentials exposed in logs or transcripts.
- Back up before deleting database or media metadata.
