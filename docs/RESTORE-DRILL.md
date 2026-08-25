# Native libSQL Restore Drill

A backup upload is not proof of recovery.

1. Create isolated disposable native libSQL, no public port.
2. Restore selected backup with Dokploy native procedure.
3. Start and run authenticated `SELECT 1`.
4. Compare schema and row counts.
5. Query representative published content, drafts, revisions, options, users, media metadata.
6. Point disposable app at restored DB.
7. Verify admin login and representative read/write.
8. Verify media metadata resolves existing R2 keys without copying objects.
9. Record IDs, timestamps, counts, results.
10. Delete disposable service only after evidence is saved.

Never restore-test by overwriting production primary.
